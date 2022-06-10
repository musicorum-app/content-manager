import { Album, AlbumImageResourceLink, Image, ImageResource, ImageResourceSource, ImageSize, Prisma, PrismaClient } from '@prisma/client'
import { yellow } from 'colorette'
import { Signale } from 'signale'
import { QueueSource } from '../queue/sources'
import { NotFoundError } from '../redis/RedisClient'
import { AlbumRequestItem, AlbumResponse, Context, DataSource } from '../typings/common'
import { hash, hashAlbum } from '../utils/hashing'
import { formatResource, imageSizeToSizeEnum, isLastFMError, normalizeString } from '../utils/utils'

const logger = new Signale({ scope: 'AlbumFinder' })

export type AlbumWithImageResources = Album & {
  album_image_resource: (AlbumImageResourceLink & {
    image_resource: ImageResource & {
      images: Image[]
    }
  })[]
}

export async function findAlbum (
  ctx: Context,
  { name, artist }: AlbumRequestItem,
  sources: DataSource[]
): Promise<AlbumWithImageResources | null> {
  const {
    redis,
    prisma
  } = ctx
  try {
    const hashedAlbum = hashAlbum(name, artist)

    const exists = await redis.getAlbum(hashedAlbum)
    if (exists && exists.hash && checkAlbumSources(exists, sources)) {
      return exists
    } else {
      const found = await getAlbumFromPrisma(prisma, hashedAlbum)

      if (found && checkAlbumSources(found, sources)) {
        redis.setAlbum(hashedAlbum, found)
        return found
      } else {
        const item: Album = {
          hash: hashedAlbum,
          name: found?.name ?? name,
          artists: found?.artists ?? [artist],
          spotify_id: found?.spotify_id ?? null,
          deezer_id: found?.deezer_id ?? null,
          tags: found?.tags ?? [],
          release_date: found?.release_date ?? null,
          created_at: found?.created_at ?? new Date(),
          updated_at: found?.updated_at ?? new Date(),
          preferred_resource: found?.preferred_resource ?? null
        }
        const resources: Prisma.ImageResourceCreateInput[] = []
        const images: Prisma.ImageCreateManyInput[] = []

        let foundOne = false

        await Promise.all(
          sources.map(async source => {
            try {
              if (source === DataSource.Spotify && !item.spotify_id) {
                await findAlbumFromSpotify(ctx, item, resources, images)
                foundOne = true
              } else if (source === DataSource.LastFM && !item.tags.length) {
                await findAlbumFromLastFM(ctx, item, resources, images)
                foundOne = true
              }
            } catch (error) {
              logger.warn(`Problem while finding ${item.name} [${source}]: ${error}`)
            }
          })
        )

        if (!foundOne) return found

        let toCreate: Prisma.AlbumCreateInput = item

        if (resources.length > 0) {
          const preferred = resources.find(r => r.source === ImageResourceSource.SPOTIFY) ?? resources[0]

          await prisma.imageResource.createMany({
            data: resources,
            skipDuplicates: true
          })

          toCreate = {
            ...item,
            preferred_resource: preferred.hash,
            updated_at: new Date(),
            album_image_resource: {
              createMany: {
                data: resources.map(r => ({
                  image_resource_hash: r.hash
                })),
                skipDuplicates: true
              }
            }
          }
        }

        await prisma.album.upsert({
          where: {
            hash: hashedAlbum
          },
          create: toCreate,
          update: toCreate
        })
          .catch(err => {
            logger.warn(`Could not upsert artist [${yellow(hashedAlbum)}]`, err)
          })

        if (images.length > 0) {
          await prisma.image.createMany({
            data: images,
            skipDuplicates: true
          })
        }

        const entry = await getAlbumFromPrisma(prisma, hashedAlbum)
        if (!entry) throw new Error('This album could not be saved.')

        redis.setAlbum(hashedAlbum, entry)

        return entry
      }
    }
  } catch (e) {
    if (e instanceof NotFoundError) {
      return null
    }
    logger.error(e)
    return null
  }
}

function getAlbumFromPrisma (prisma: PrismaClient, hash: string) {
  return prisma.album.findUnique({
    where: {
      hash
    },
    include: {
      album_image_resource: {
        include: {
          image_resource: {
            include: {
              images: true
            }
          }
        }
      }
    }
  })
}

function checkAlbumSources (album: AlbumWithImageResources, sources: DataSource[]) {
  if (sources.includes(DataSource.Spotify) && !album.spotify_id) return false
  if (sources.includes(DataSource.LastFM) && !album.tags.length) return false
  if (sources.includes(DataSource.Deezer) && !album.deezer_id) return false
  return true
}

async function findAlbumFromSpotify (
  ctx: Context,
  item: Album,
  resources: Prisma.ImageResourceCreateInput[],
  images: Prisma.ImageCreateManyInput[]
) {
  if (await ctx.redis.checkIfIsNotFound(item.hash, DataSource.Spotify)) {
    logger.warn(`Resource was not found previously [${yellow(item.name)}]`)
    return
  }

  const res = await ctx.queueController.queueTask(
    QueueSource.Spotify,
    () => ctx.spotifyApi.searchAlbum(item.name, item.artists[0])
  )

  if (res.albums?.items.length === 0) {
    ctx.redis.setAsNotFound(item.hash, DataSource.Spotify)
    throw new Error('Could not find album on spotify')
  }

  let selected = res.albums?.items
    .find(a => normalizeString(a.name) === normalizeString(item.name)) as SpotifyAlbum

  if (!selected) {
    selected = res.albums?.items[0] as SpotifyAlbum
  }

  item.name = selected.name
  item.artists = selected.artists.map(a => a.name)
  item.spotify_id = selected.id
  item.release_date = selected.release_date ?? null

  if (selected.images && selected.images.length > 0 && selected.images[0].url) {
    const resourceHash = hash(selected.images.map(i => i.url).join(''))
    resources.push({
      hash: resourceHash,
      source: ImageResourceSource.SPOTIFY
    })
    images.push(...selected.images.map(
      image => ({
        hash: hash(image.url),
        url: image.url,
        size: imageSizeToSizeEnum(image.width, image.height),
        image_resource_hash: resourceHash
      })
    ))
  }
}

async function findAlbumFromLastFM (
  ctx: Context,
  item: Album,
  resources: Prisma.ImageResourceCreateInput[],
  images: Prisma.ImageCreateManyInput[]
) {
  if (await ctx.redis.checkIfIsNotFound(item.hash, DataSource.LastFM)) {
    logger.warn(`Resource was not found previously [${yellow(item.name)}]`)
    return
  }

  try {
    const res = await ctx.queueController.queueTask(
      QueueSource.LastFM,
      () => ctx.lastfm.album.getInfo({
        album: item.name,
        artist: item.artists[0]
      })
    )

    item.name = res.name
    item.tags = [...item.tags, ...res.tags.map(t => t.name)]
    item.artists[0] = res.artist

    if (res.image.length >= 4 && res.image[3].url) {
      const resourceHash = hash(res.image.map(i => i.url).join(''))
      resources.push({
        hash: resourceHash,
        source: ImageResourceSource.LASTFM
      })

      images.push({
        hash: hash(res.image[3].url),
        url: res.image[3].url,
        size: ImageSize.MEDIUM,
        image_resource_hash: resourceHash
      })
    }
  } catch (err) {
    if (isLastFMError(err) && err.code === 6) {
      ctx.redis.setAsNotFound(item.hash, DataSource.LastFM)
      throw new Error('Could not find album on lastfm')
    } else throw err
  }
}

export function formatDisplayAlbum ({
  hash,
  name,
  artists,
  release_date,
  spotify_id,
  deezer_id,
  tags,
  album_image_resource,
  preferred_resource,
  created_at,
  updated_at
}: AlbumWithImageResources): AlbumResponse {
  return {
    hash,
    name,
    spotify_id: spotify_id,
    deezer_id: deezer_id,
    artists: artists,
    tags: tags,
    release_date: release_date,
    preferred_resource: preferred_resource || album_image_resource[0]?.image_resource_hash,
    resources: album_image_resource.map(r => formatResource(r.image_resource)),
    created_at: new Date(created_at).getTime().toString(),
    updated_at: updated_at ? new Date(updated_at).getTime().toString() : null
  }
}
