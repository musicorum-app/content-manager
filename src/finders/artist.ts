import { hash, hashArtist } from '../utils/hashing'
import { ArtistResponse, Context } from '../typings/common'
import { Artist, ImageResourceSource } from '@prisma/client'
import { doNothing, formatList, formatListBack, normalizeString, valueOrNull } from '../utils/utils'
import { Signale } from 'signale'
import { NotFoundError } from '../redis/RedisClient'
import { QueueSource } from '../queue/sources'

const logger = new Signale({ scope: 'ArtistFinder' })

export async function findArtist (
  {
    spotifyApi,
    redis,
    prisma,
    queueController
  }: Context, name: string): Promise<ArtistResponse | null> {
  try {
    const hashedArtist = hashArtist(name)

    const exists = await redis.getArtist(hashedArtist)
    if (exists && exists.hash) {
      return formatDisplayArtist(exists)
    } else {
      const found = await prisma.artist.findUnique({
        where: {
          hash: hashedArtist
        }
      })

      if (found) {
        redis.setArtist(hashedArtist, found)
        return formatDisplayArtist(found)
      } else {
        logger.time(`Artist task for ${name}`)
        const res = await queueController.queueTask<SpotifySearchResponse>(
          QueueSource.Spotify,
          () => spotifyApi.searchArtist(name)
        )

        logger.timeEnd(`Artist task for ${name}`)

        if (res.artists?.items.length === 0) {
          redis.setAsNotFound(hashedArtist)
          return null
        }

        let selected = res.artists?.items.find(a => normalizeString(a.name) === normalizeString(name)) as SpotifyArtist

        if (!selected) {
          selected = res.artists?.items[0] as SpotifyArtist
        }

        const item: Artist = {
          hash: hashedArtist,
          name: selected.name,
          spotify_id: selected.id,
          deezer_id: null,
          genres: selected.genres,
          similar: [],
          tags: [],
          created_at: new Date(),
          updated_at: new Date()
        }

        redis.setArtist(hashedArtist, item)
        redis.setPopularity(selected.id, selected.popularity)

        const hasImage = selected.images && selected.images.length > 0 && selected.images[0].url

        prisma.artist.create({
          data: hasImage ? {
            ...item,
            resources: {
              create: {
                hash: hash(selected.images.map(i => i.url).join('')),
                source: ImageResourceSource.SPOTIFY,
                images: {
                  createMany: {
                    data: selected.images.map(image => ({
                      hash: hash(image.url),
                      width: image.width,
                      height: image.height
                    }))
                  }
                }
              }
            }
          } : item
        })
          .then(() => doNothing())
          .catch(err => logger.error(err))
        return formatDisplayArtist(item)
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

function formatDisplayArtist ({
  hash,
  name,
  spotify_id,
  deezer_id,
  genres,
  similar,
  tags,
  created_at
}: Artist): ArtistResponse {
  return {
    hash,
    name,
    spotify_id: valueOrNull(spotify_id),
    deezer_id: valueOrNull(deezer_id),
    resources: [],
    genres,
    similar,
    tags,
    popularity: null,
    created_at: created_at.getTime().toString()
  }
}
