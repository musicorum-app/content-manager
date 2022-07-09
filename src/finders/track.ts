import DeezerAPI from '../apis/Deezer'
import { Context, DataSource, EntityType, Nullable, TrackRequestItem, TrackResponse } from '../typings/common'
import { NotFoundError } from '../redis/RedisClient'
import { Signale } from 'signale'
import { hash, hashTrack } from '../utils/hashing'
import { Image, ImageResource, ImageResourceSource, ImageSize, Prisma, PrismaClient, Track, TrackImageResourceLink } from '@prisma/client'
import { formatResource, imageSizeToSizeEnum, isLastFMError, normalizeString } from '../utils/utils'
import { QueueSource } from '../queue/sources'
import { yellow } from 'colorette'
import { resolveResourcePalette } from '../modules/palette'

const logger = new Signale({ scope: 'TrackFinder' })

export type TrackWithImageResources = Track & {
  track_image_resource: (TrackImageResourceLink & {
    image_resource: ImageResource & {
      images: Image[]
    }
  })[]
}

export async function findTrack (
  ctx: Context,
  { name, artist, album }: TrackRequestItem,
  preview: boolean,
  sources: DataSource[]
): Promise<TrackWithImageResources | null> {
  const {
    redis,
    prisma
  } = ctx

  const end = ctx.monitoring.startResourcesTimer('tracks')

  try {
    const hashedTrack = hashTrack(name, artist, album || '')

    const exists = await redis.getTrack(hashedTrack)
    if (exists && exists.hash && checkTrackSources(exists, sources, preview)) {
      end(1)
      return exists
    } else {
      const found = await getTrackFromPrisma(prisma, hashedTrack)

      if (found && checkTrackSources(found, sources, preview)) {
        redis.setTrack(hashedTrack, found)
        end(2)
        return found
      } else {
        const item: Track = {
          hash: hashedTrack,
          name: found?.name ?? name,
          artists: found?.artists ?? [artist],
          album: found?.album ?? album ?? null,
          spotify_id: found?.spotify_id ?? null,
          deezer_id: found?.deezer_id ?? null,
          genius_id: found?.genius_id ?? null,
          tags: found?.tags ?? [],
          duration: found?.duration ?? null,
          preview: found?.preview ?? null,
          explicit: found?.explicit ?? null,
          preferred_resource: found?.preferred_resource ?? null,
          created_at: found?.created_at ?? new Date(),
          updated_at: found?.updated_at ?? new Date()
        }
        const resources: Prisma.ImageResourceCreateInput[] = []
        const images: Prisma.ImageCreateManyInput[] = []

        let foundOne = false

        await Promise.all(
          sources.map(async source => {
            try {
              if (source === DataSource.Spotify && !item.spotify_id) {
                await findTrackFromSpotify(ctx, item, resources, images)
                foundOne = true
              } else if (source === DataSource.LastFM && !item.tags.length) {
                await findTrackFromLastFM(ctx, item, resources, images)
                foundOne = true
              } else if (source === DataSource.Deezer && !item.deezer_id) {
                await findTrackFromDeezer(ctx, item, resources, images)
                foundOne = true
              }
            } catch (error) {
              logger.warn(`Problem while finding ${item.name} [${source}]: ${error}`)
            }
          })
        )

        if (preview && !item.preview) {
          if (!item.spotify_id) {
            await findTrackFromSpotify(ctx, item, resources, images)

            if (!item.preview) {
              await findTrackFromDeezer(ctx, item, resources, images)
            }
          } else {
            await findTrackFromDeezer(ctx, item, resources, images)
          }
          if (item.preview) foundOne = true
        }

        if (!foundOne) {
          end(2)
          return found
        }

        let toCreate: Prisma.TrackCreateInput = item

        if (resources.length > 0) {
          const preferred = resources.find(r => r.source === ImageResourceSource.SPOTIFY) ?? resources[0]

          await prisma.imageResource.createMany({
            data: resources,
            skipDuplicates: true
          })

          toCreate = {
            ...item,
            updated_at: new Date(),
            preferred_resource: preferred.hash,
            track_image_resource: {
              createMany: {
                data: resources.map(r => ({
                  image_resource_hash: r.hash
                })),
                skipDuplicates: true
              }
            }
          }
        }

        await prisma.track.upsert({
          where: {
            hash: hashedTrack
          },
          create: toCreate,
          update: toCreate
        })
          .catch(err => {
            logger.warn(`Could not upsert track [${yellow(hashedTrack)}]`, err)
          })

        if (images.length > 0) {
          await prisma.image.createMany({
            data: images,
            skipDuplicates: true
          })
        }

        const entry = await getTrackFromPrisma(prisma, hashedTrack)
        if (!entry) throw new Error('This track could not be saved.')

        redis.setTrack(hashedTrack, entry)

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

function getTrackFromPrisma (prisma: PrismaClient, hash: string) {
  return prisma.track.findUnique({
    where: {
      hash
    },
    include: {
      track_image_resource: {
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

function checkTrackSources (track: TrackWithImageResources, sources: DataSource[], preview: boolean) {
  if (sources.includes(DataSource.Spotify) && !track.spotify_id) return false
  if (sources.includes(DataSource.LastFM) && !track.tags.length) return false
  if (sources.includes(DataSource.Deezer) && !track.deezer_id) return false
  if (preview && !track.preview) return false
  return true
}

async function findTrackFromSpotify (
  ctx: Context,
  item: Track,
  resources: Prisma.ImageResourceCreateInput[],
  images: Prisma.ImageCreateManyInput[]
) {
  if (await ctx.redis.checkIfIsNotFound(item.hash, DataSource.Spotify)) {
    logger.warn(`Resource was not found previously [${yellow(item.name)}]`)
    return
  }

  const albumAdc = item.album ? ` album:${item.album}` : ''
  const end = ctx.monitoring.startExternalRequestTimer(DataSource.Spotify, 'searchTrack')
  const res = await ctx.queueController.queueTask<SpotifySearchResponse>(
    QueueSource.Spotify,
    () => ctx.spotifyApi
      .searchTrack(`"${item.name}" artist:${item.artists[0]}${albumAdc}`)
  )
  end()

  if (res.tracks?.items.length === 0) {
    ctx.redis.setAsNotFound(item.hash, DataSource.Spotify)
    throw new Error('Could not find track on spotify')
  }

  let selected = res.tracks?.items
    .find(a => normalizeString(a.name) === normalizeString(item.name)) as SpotifyTrack

  if (!selected) {
    selected = res.tracks?.items[0] as SpotifyTrack
  }

  item.name = selected.name
  item.album = selected.album.name
  item.artists = selected.artists.map(a => a.name)
  item.spotify_id = selected.id
  item.duration = selected.duration_ms
  item.preview = selected.preview_url ?? null
  item.explicit = selected.explicit ?? null

  const spotifyImages = selected.album.images

  if (spotifyImages && spotifyImages.length > 0 && spotifyImages[0].url) {
    const resourceHash = hash(spotifyImages.map(i => i.url).join(''))
    resources.push({
      hash: resourceHash,
      source: ImageResourceSource.SPOTIFY
    })
    images.push(...spotifyImages.map(
      image => ({
        hash: hash(image.url),
        url: image.url,
        size: imageSizeToSizeEnum(image.width, image.height),
        image_resource_hash: resourceHash
      })
    ))
  }
}

async function findTrackFromLastFM (
  ctx: Context,
  item: Track,
  resources: Prisma.ImageResourceCreateInput[],
  images: Prisma.ImageCreateManyInput[]
) {
  if (await ctx.redis.checkIfIsNotFound(item.hash, DataSource.LastFM)) {
    logger.warn(`Resource was not found previously [${yellow(item.name)}]`)
    return
  }

  console.log(item.tags.length, await ctx.redis.checkIfIsNotFound(item.hash, DataSource.LastFM))

  try {
    const end = ctx.monitoring.startExternalRequestTimer(DataSource.LastFM, 'track.getInfo')
    const res = await ctx.queueController.queueTask(
      QueueSource.LastFM,
      () => ctx.lastfm.track.getInfo({
        track: item.name,
        artist: item.artists[0],
        autocorrect: true
      })
    )
    end()

    item.name = res.name
    item.tags = [...item.tags, ...res.toptags.map(t => t.name)]
    item.artists[0] = res.artist.name

    if (res.toptags.length === 0) {
      // @todo: make this better
      ctx.redis.setAsNotFound(item.hash, DataSource.LastFM)
    }

    if (res.album?.image && res.album?.image.length >= 4 && res.album?.image[3].url) {
      const resourceHash = hash(res.album.image.map(i => i.url).join(''))
      resources.push({
        hash: resourceHash,
        source: ImageResourceSource.LASTFM
      })

      images.push({
        hash: hash(res.album.image[3].url),
        url: res.album.image[3].url,
        size: ImageSize.MEDIUM,
        image_resource_hash: resourceHash
      })
    }
  } catch (err) {
    console.log(err)
    if (isLastFMError(err) && err.code === 6) {
      ctx.redis.setAsNotFound(item.hash, DataSource.LastFM)
      throw new Error('Could not find album on lastfm')
    } else throw err
  }
}

async function findTrackFromDeezer (
  ctx: Context,
  item: Track,
  resources: Prisma.ImageResourceCreateInput[],
  images: Prisma.ImageCreateManyInput[]
) {
  if (await ctx.redis.checkIfIsNotFound(item.hash, DataSource.Deezer)) {
    logger.warn(`Resource was not found previously [${yellow(item.name)}]`)
    return
  }

  const end = ctx.monitoring.startExternalRequestTimer(DataSource.Deezer, 'searchTrack')
  const {
    data
  } = await ctx.queueController.queueTask(
    QueueSource.Deezer,
    () => DeezerAPI.searchTrack(item.name, item.artists[0], item.album ?? undefined)
  )
  end()

  if (data.length === 0) {
    ctx.redis.setAsNotFound(item.hash, DataSource.Deezer)
    throw new Error('Could not find track on deezer')
  }

  const selected = data
    .find(a => normalizeString(a.title) === normalizeString(item.name)) || data[0]

  item.deezer_id = selected.id
  item.preview = selected.preview
  item.explicit = item.explicit ? true : selected.explicit_lyrics
  item.album = item.album ?? selected.album.title
  item.duration = item.duration || selected.duration * 1000

  const album = selected.album
  if (album && album.cover_big) {
    const resourceHash = hash(album.cover_big)
    resources.push({
      hash: resourceHash,
      source: ImageResourceSource.DEEZER
    })
    images.push({
      hash: hash(album.cover_big),
      url: album.cover_big,
      size: imageSizeToSizeEnum(500, 500),
      image_resource_hash: resourceHash
    })
  }
}

export function formatDisplayTrack ({
  hash,
  name,
  album,
  artists,
  spotify_id,
  deezer_id,
  genius_id,
  tags,
  duration,
  preview,
  explicit,
  created_at,
  updated_at,
  track_image_resource,
  preferred_resource
}: TrackWithImageResources): TrackResponse {
  return {
    hash,
    name,
    album,
    artists,
    spotify_id,
    deezer_id,
    genius_id,
    tags,
    duration,
    preview,
    explicit,
    preferred_resource: preferred_resource || track_image_resource[0]?.image_resource_hash || null,
    resources: track_image_resource.map(r => formatResource(r.image_resource)),
    created_at: new Date(created_at).getTime().toString(),
    updated_at: updated_at ? new Date(updated_at).getTime().toString() : null,
    features: null
  }
}

export async function findManyTracks (
  ctx: Context,
  tracks: TrackRequestItem[],
  sources: DataSource[],
  preview: boolean,
  retrievePalette: boolean
) {
  const hashes = tracks.map(t => hashTrack(t.name, t.artist, t.album || ''))

  const founded = await ctx.redis.getManyObjects(hashes, EntityType.Track)

  if (!founded || founded.length === 0) throw new Error('Could not find tracks on redis')

  let onRedis = 0

  const promises = founded.map(async (track, index) => {
    try {
      let trackObject: Nullable<TrackWithImageResources> = null
      if (typeof track === 'string') {
        const object = JSON.parse(track) as TrackWithImageResources
        const checkedTrackSources = checkTrackSources(object, sources, preview)

        if (checkedTrackSources) onRedis++

        trackObject = checkedTrackSources
          ? object
          : await findTrack(ctx, tracks[index], preview, sources)
      } else {
        await ctx.redis.checkIfIsNull(hashes[index], EntityType.Track)
        trackObject = await findTrack(ctx, tracks[index], preview, sources)
      }

      if (!trackObject) return null
      if (retrievePalette) {
        if (await resolveResourcePalette(ctx, trackObject.track_image_resource)) {
          await ctx.redis.setTrack(trackObject.hash, trackObject)
        }
      }
      return formatDisplayTrack(trackObject)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return null
      }
      logger.error(err)
      return null
    }
  })

  logger.time('Promises')
  return Promise.all(promises)
    .then(r => {
      logger.timeEnd('Promises')
      ctx.monitoring.metrics.resourcesCounter
        .labels({ type: 'track', level: 1 })
        .inc(onRedis)
      return r
    })
}
