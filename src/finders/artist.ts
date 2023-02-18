import { hash, hashArtist } from '../utils/hashing'
import {
  ArtistResponse,
  Context,
  DataSource,
  EntityType,
  Nullable
} from '../typings/common'
import {
  Artist,
  ArtistImageResourceLink,
  Image,
  ImageResource,
  ImageResourceSource,
  ImageSize,
  Prisma,
  PrismaClient
} from '@prisma/client'
import {
  formatResource,
  imageSizeToSizeEnum,
  isLastFMError,
  normalizeString
} from '../utils/utils'
import { Signale } from 'signale'
import { NotFoundError } from '../redis/RedisClient'
import { QueueSource } from '../queue/sources'
import { red, yellow } from 'colorette'
import { resolveResourcePalette } from '../modules/palette'
import { getInfo } from 'lastfm-typed/dist/interfaces/artistInterface'
import { Image as LastfmImage } from 'lastfm-typed/dist/interfaces/shared'

const logger = new Signale({ scope: 'ArtistFinder' })

export type ArtistWithImageResources = Artist & {
  artist_image_resource: (ArtistImageResourceLink & {
    image_resource: ImageResource & {
      images: Image[];
    };
  })[];
};

export type CreateImageResourceWithImages = Prisma.ImageResourceCreateInput & {
  images: Prisma.ImageCreateInput[];
};

interface LastfmArtistResponseWithImage extends getInfo {
  image: LastfmImage[];
}

export async function findArtist (
  ctx: Context,
  name: string,
  sources: DataSource[]
): Promise<ArtistWithImageResources | null> {
  const { redis, prisma } = ctx
  const end = ctx.monitoring.startResourcesTimer('artists')

  try {
    const hashedArtist = hashArtist(name)

    // logger.debug('Searching for artist ' + name)
    const exists = await redis.getArtist(hashedArtist)
    // logger.debug('Found artist ' + name + ' in redis with %sms', performance.now() - redisStart)
    if (exists && exists.hash && checkArtistSources(exists, sources)) {
      end(1)
      return exists
    } else {
      const found = await getArtistFromPrisma(prisma, hashedArtist)
      if (found && checkArtistSources(found, sources)) {
        redis.setArtist(hashedArtist, found)
        end(2)
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
          preferred_resource: found?.preferred_resource ?? null,
          created_at: found?.created_at ?? new Date(),
          updated_at: found?.updated_at ?? new Date()
        }

        const resources: Prisma.ImageResourceCreateInput[] = []
        const images: Prisma.ImageCreateManyInput[] = []

        let foundOne = false

        await Promise.all(
          sources.map(async (source) => {
            try {
              if (source === DataSource.Spotify && !item.spotify_id) {
                await findArtistFromSpotify(ctx, item, resources, images)
                foundOne = true
              } else if (
                source === DataSource.LastFM &&
                !(item.similar.length || item.tags.length)
              ) {
                await findArtistFromLastFM(ctx, item, resources, images)
                foundOne = true
              }
            } catch (error) {
              logger.warn(
                `Problem while finding ${item.name} [${source}]: ${error}`
              )
            }
          })
        )

        if (!foundOne) {
          end(2)
          return found
        }

        let toCreate: Prisma.ArtistCreateInput = item

        if (resources.length > 0) {
          const preferred =
            resources.find((r) => r.source === ImageResourceSource.SPOTIFY) ??
            resources[0]

          await prisma.imageResource.createMany({
            data: resources,
            skipDuplicates: true
          })

          toCreate = {
            ...item,
            preferred_resource: preferred.hash,
            artist_image_resource: {
              createMany: {
                data: resources.map((r) => ({
                  image_resource_hash: r.hash
                })),
                skipDuplicates: true
              }
            }
          }
        }

        await prisma.artist
          .upsert({
            where: {
              hash: hashedArtist
            },
            create: toCreate,
            update: {
              ...toCreate,
              updated_at: new Date()
            }
          })
          .catch((err) => {
            logger.warn(
              `Could not upsert artist [${yellow(hashedArtist)}]`,
              err
            )
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

        end(3)
        return entry
      }
    }
  } catch (e) {
    end(0)
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
      artist_image_resource: {
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

function checkArtistSources (
  artist: ArtistWithImageResources,
  sources: DataSource[]
) {
  if (sources.includes(DataSource.Spotify) && !artist.spotify_id) return false
  if (sources.includes(DataSource.LastFM)) {
    if (!artist.artist_image_resource.find(
      (r) => r.image_resource.source === ImageResourceSource.LASTFM
    )) {
      return false
    }
    
    if (!artist.tags.length || !artist.similar.length) {
      return false
    }
  }
  if (sources.includes(DataSource.Deezer) && !artist.deezer_id) return false
  return true
}

async function findArtistFromSpotify (
  ctx: Context,
  item: Artist,
  resources: Prisma.ImageResourceCreateInput[],
  images: Prisma.ImageCreateManyInput[]
) {
  if (await ctx.redis.checkIfIsNotFound(item.hash, DataSource.Spotify)) {
    logger.warn(`Resource was not found previously [${yellow(item.name)}]`)
    return
  }
  const end = ctx.monitoring.startExternalRequestTimer(
    DataSource.Spotify,
    'searchArtist'
  )
  const res = await ctx.queueController.queueTask(QueueSource.Spotify, () =>
    ctx.spotifyApi.searchArtist(item.name)
  )
  end()

  if (res.artists?.items.length === 0) {
    ctx.redis.setAsNotFound(item.hash, DataSource.Spotify)
    throw new Error('Could not find artist on spotify')
  }

  let selected = res.artists?.items.find(
    (a) => normalizeString(a.name) === normalizeString(item.name)
  ) as SpotifyArtist

  if (!selected) {
    selected = res.artists?.items[0] as SpotifyArtist
  }

  item.name = selected.name
  item.spotify_id = selected.id
  item.genres.push(...selected.genres)

  if (selected.images && selected.images.length > 0 && selected.images[0].url) {
    const resourceHash = hash(selected.images.map((i) => i.url).join(''))
    resources.push({
      hash: resourceHash,
      source: ImageResourceSource.SPOTIFY
    })
    images.push(
      ...selected.images.map((image) => ({
        hash: hash(image.url),
        url: image.url,
        size: imageSizeToSizeEnum(image.width, image.height),
        image_resource_hash: resourceHash
      }))
    )
  }

  await ctx.redis.setPopularity(selected.id, selected.popularity)
}

async function findArtistFromLastFM (
  ctx: Context,
  item: Artist,
  resources: Prisma.ImageResourceCreateInput[],
  images: Prisma.ImageCreateManyInput[]
) {
  if (await ctx.redis.checkIfIsNotFound(item.hash, DataSource.LastFM)) {
    logger.warn(
      `Resource was not found previously (${red('LFM')}) [${yellow(item.name)}]`
    )
    return
  }

  try {
    const end = ctx.monitoring.startExternalRequestTimer(
      DataSource.LastFM,
      'artist.getInfo'
    )
    const res = await ctx.queueController.queueTask(
      QueueSource.LastFM,
      () =>
        ctx.lastfm.artist.getInfo({
          artist: item.name,
          user: 'musicorum'
        }) as Promise<LastfmArtistResponseWithImage>
    )
    end()

    item.tags.push(...res.tags.map((t) => t.name))
    item.similar.push(...res.similarArtists.map((a) => a.name))

    if (!(item.tags.length || item.similar.length)) {
      // If there's no tags or similar artists, set it as not found so
      // it wont be searched again when bypassed py the checkArtistSources
      ctx.redis.setAsNotFound(item.hash, DataSource.LastFM)
    }

    if (
      res.image.length >= 4 &&
      res.image[3].url &&
      !res.image[3].url.includes('2a96cbd8b46e442fc41c2b86b821562f.png')
    ) {
      const resourceHash = hash(res.image.map((i) => i.url).join(''))

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

      item.preferred_resource = resourceHash
    }
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
  artist_image_resource,
  preferred_resource,
  tags,
  created_at,
  updated_at
}: ArtistWithImageResources): ArtistResponse {
  return {
    hash,
    name,
    spotify_id: spotify_id,
    deezer_id: deezer_id,
    genres: genres,
    similar: similar,
    tags: tags,
    popularity: null,
    preferred_resource:
      preferred_resource ||
      artist_image_resource[0]?.image_resource.hash ||
      null,
    resources: artist_image_resource.map((r) =>
      formatResource(r.image_resource)
    ),
    created_at: new Date(created_at).getTime().toString(),
    updated_at: updated_at ? new Date(updated_at).getTime().toString() : null
  }
}

export async function findManyArtists (
  ctx: Context,
  artists: string[],
  sources: DataSource[],
  retrievePalette: boolean
) {
  const hashes = artists.map((a) => hashArtist(a))

  const founded = await ctx.redis.getManyObjects(hashes, EntityType.Artist)

  if (!founded || founded.length === 0) { throw new Error('Could not find artists on redis') }

  let onRedis = 0

  const promises = founded.map(async (artist, index) => {
    try {
      let artistObject: Nullable<ArtistWithImageResources> = null
      if (typeof artist === 'string') {
        const object = JSON.parse(artist) as ArtistWithImageResources
        const checkedArtistSources = checkArtistSources(object, sources)

        if (checkedArtistSources) onRedis++

        artistObject = checkedArtistSources
          ? object
          : await findArtist(ctx, artists[index], sources)
      } else {
        await ctx.redis.checkIfIsNull(hashes[index], EntityType.Artist)
        artistObject = await findArtist(ctx, artists[index], sources)
      }

      if (!artistObject) return null
      if (retrievePalette) {
        if (
          await resolveResourcePalette(ctx, artistObject.artist_image_resource)
        ) {
          await ctx.redis.setArtist(artistObject.hash, artistObject)
        }
      }
      return formatDisplayArtist(artistObject)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return null
      }
      logger.error(err)
      return null
    }
  })

  logger.time('Promises')
  return Promise.all(promises).then((r) => {
    logger.timeEnd('Promises')
    ctx.monitoring.metrics.resourcesCounter
      .labels({ type: 'artist', level: 1 })
      .inc(onRedis)
    return r
  })
}
