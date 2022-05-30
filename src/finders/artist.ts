import { hash, hashArtist } from '../utils/hashing'
import { ArtistResponse, Context, DataSource } from '../typings/common'
import { Artist, Image, ImageResource, ImageResourceSource, Prisma, PrismaClient } from '@prisma/client'
import { fromListOrArray, imageSizeToSizeEnum, isLastFMError, normalizeString, valueOrNull } from '../utils/utils'
import { Signale } from 'signale'
import { NotFoundError } from '../redis/RedisClient'
import { QueueSource } from '../queue/sources'

const logger = new Signale({ scope: 'ArtistFinder' })

export type ArtistWithImageResources = Artist & {
  resources: (ImageResource & {
    images: Image[]
  })[]
}

export type CreateImageResourceWithImages = Prisma.ImageResourceCreateInput & {
  images: Prisma.ImageCreateInput[]
}

export async function findArtist (
  ctx: Context,
  name: string,
  sources: DataSource[]
): Promise<ArtistWithImageResources | null> {
  const {
    redis,
    prisma
  } = ctx
  try {
    const hashedArtist = hashArtist(name)

    const exists = await redis.getArtist(hashedArtist)
    if (exists && exists.hash && checkArtistSources(exists, sources)) {
      return exists
    } else {
      const found = await getArtistFromPrisma(prisma, hashedArtist)
      if (found && checkArtistSources(found, sources)) {
        redis.setArtist(hashedArtist, found)
        return found
      } else {
        const item: Artist = {
          hash: hashedArtist,
          name: found?.name ?? name,
          spotify_id: found?.spotify_id ?? null,
          deezer_id: found?.deezer_id ?? null,
          genres: found?.genres ?? [],
          similar: found?.similar ?? [],
          tags: found?.tags ?? [],
          created_at: found?.created_at ?? new Date(),
          updated_at: found?.updated_at ?? new Date()
        }

        const resources: Prisma.ImageResourceCreateInput[] = []
        const images: Prisma.ImageCreateManyInput[] = []

        let foundOne = false

        await Promise.all(
          sources.map(async source => {
            console.log(source)
            try {
              if (source === DataSource.Spotify && !item.spotify_id) {
                await findArtistFromSpotify(ctx, item, resources, images)
                foundOne = true
              } else if (source === DataSource.LastFM && !(item.similar.length || item.tags.length)) {
                await findArtistFromLastFM(ctx, item)
                foundOne = true
              }
            } catch (error) {
              logger.warn(`Problem while finding ${item.name} [${source}]: ${error}`)
            }
          })
        )

        if (!foundOne) return found

        let toCreate: Prisma.ArtistCreateInput = item

        if (resources.length > 0) {
          toCreate = {
            ...item,
            resources: {
              createMany: {
                data: resources,
                skipDuplicates: true
              }
            }
          }
        }

        await prisma.artist.upsert({
          where: {
            hash: hashedArtist
          },
          create: toCreate,
          update: toCreate
        })

        if (images.length > 0) {
          await prisma.image.createMany({
            data: images,
            skipDuplicates: true
          })
        }

        const entry = await getArtistFromPrisma(prisma, hashedArtist)
        if (!entry) throw new Error('This artist could not be saved.')

        redis.setArtist(hashedArtist, entry)

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

function getArtistFromPrisma (prisma: PrismaClient, hash: string) {
  return prisma.artist.findUnique({
    where: {
      hash
    },
    include: {
      resources: {
        include: {
          images: true
        }
      }
    }
  })
}

function checkArtistSources (artist: ArtistWithImageResources, sources: DataSource[]) {
  if (sources.includes(DataSource.Spotify) && !artist.spotify_id) return false
  if (sources.includes(DataSource.LastFM) && !(artist.tags.length || artist.similar.length)) return false
  if (sources.includes(DataSource.Deezer) && !artist.deezer_id) return false
  return true
}

async function findArtistFromSpotify (ctx: Context, item: Artist, resources: Prisma.ImageResourceCreateInput[], images: Prisma.ImageCreateManyInput[]) {
  if (await ctx.redis.chechIfIsNotFound(item.hash, DataSource.Spotify)) {
    throw new Error('Resource was not found previously')
  }
  const res = await ctx.queueController.queueTask(
    QueueSource.Spotify,
    () => ctx.spotifyApi.searchArtist(item.name)
  )

  if (res.artists?.items.length === 0) {
    ctx.redis.setAsNotFound(item.hash, DataSource.Spotify)
    throw new Error('Could not find artist on spotify')
  }

  let selected = res.artists?.items
    .find(a => normalizeString(a.name) === normalizeString(item.name)) as SpotifyArtist

  if (!selected) {
    selected = res.artists?.items[0] as SpotifyArtist
  }

  item.name = selected.name
  item.spotify_id = selected.id
  item.genres.push(...selected.genres)

  if (selected.images && selected.images.length > 0 && selected.images[0].url) {
    const resourceHash = hash(selected.images.map(i => i.url).join('') + item.hash)
    resources.push({
      hash: resourceHash,
      source: ImageResourceSource.SPOTIFY
    })
    images.push(...selected.images.map(
      image => ({
        hash: hash(image.url + item.hash),
        url: image.url,
        size: imageSizeToSizeEnum(image.width, image.height),
        image_resource: resourceHash
      })
    ))
  }

  await ctx.redis.setPopularity(selected.id, selected.popularity)
}

async function findArtistFromLastFM (ctx: Context, item: Artist) {
  if (await ctx.redis.chechIfIsNotFound(item.hash, DataSource.LastFM)) {
    throw new Error('Resource was not found previously')
  }

  try {
    const res = await ctx.queueController.queueTask(
      QueueSource.LastFM,
      () => ctx.lastfm.artist.getInfo({ artist: item.name })
    )

    item.tags.push(...res.tags.map(t => t.name))
    item.similar.push(...res.similarArtists.map(a => a.name))
  } catch (err) {
    if (isLastFMError(err) && err.code === 6) {
      ctx.redis.setAsNotFound(item.hash, DataSource.LastFM)
      throw new Error('Could not find artist on lastfm')
    } else throw err
  }
}

export function formatDisplayArtist ({
  hash,
  name,
  spotify_id,
  deezer_id,
  genres,
  similar,
  resources,
  tags,
  created_at
}: ArtistWithImageResources): ArtistResponse {
  return {
    hash,
    name,
    spotify_id: valueOrNull(spotify_id),
    deezer_id: valueOrNull(deezer_id ? Number(deezer_id) : null),
    resources: resources.map(resource => ({
      hash: resource.hash,
      explicit: resource.explicit,
      source: resource.source,
      color_palette: {
        vibrant: resource.palette_vibrant,
        dark_vibrant: resource.palette_dark_vibrant,
        light_vibrant: resource.palette_light_vibrant,
        muted: resource.palette_muted,
        dark_muted: resource.palette_dark_muted,
        light_muted: resource.palette_light_muted
      },
      active: resource.active,
      // convert to date because of redis data is a JSON
      created_at: new Date(resource.created_at).getTime().toString(),
      images: resource.images.map(image => ({
        hash: image.hash,
        url: image.url,
        size: image.size
      }))
    })),
    genres: fromListOrArray(genres),
    similar: fromListOrArray(similar),
    tags: fromListOrArray(tags),
    popularity: null,
    created_at: new Date(created_at).getTime().toString()
  }
}
