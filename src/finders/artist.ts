import { hashArtist } from '../utils/hashing'
import { ArtistResponse, Context } from '../typings/common'
import { Artist } from '@prisma/client'
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
    const hash = hashArtist(name)

    const exists = await redis.getArtist(hash)
    if (exists && exists.hash) {
      return formatDisplayArtist(exists)
    } else {
      const found = await prisma.artist.findUnique({
        where: {
          hash
        }
      })

      if (found) {
        redis.setArtist(hash, found)
        return formatDisplayArtist(found)
      } else {
        logger.time(`Artist task for ${name}`)
        const res = await queueController.queueTask<SpotifySearchResponse>(
          QueueSource.Spotify,
          () => spotifyApi.searchArtist(name)
        )

        logger.timeEnd(`Artist task for ${name}`)

        if (res.artists?.items.length === 0) {
          redis.setAsNotFound(hash)
          return null
        }

        let selected = res.artists?.items.find(a => normalizeString(a.name) === normalizeString(name)) as SpotifyArtist

        if (!selected) {
          selected = res.artists?.items[0] as SpotifyArtist
        }

        const item: Artist = {
          hash,
          name: selected.name,
          spotify_id: selected.id,
          deezer_id: null,
          spotify_images: formatList(selected.images.map(i => i.url)),
          spotify_images_colors: null,
          deezer_image: null,
          deezer_images_colors: null,
          genres: formatList(selected.genres),
          cached_at: (new Date().getTime()).toString()
        }

        redis.setArtist(hash, item)
        redis.setPopularity(selected.id, selected.popularity)

        prisma.artist.create({
          data: item
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
  spotify_images,
  spotify_images_colors,
  deezer_image,
  deezer_images_colors,
  genres,
  cached_at
}: Artist): ArtistResponse {
  return {
    hash,
    name,
    spotify_id: valueOrNull(spotify_id),
    deezer_id: valueOrNull(deezer_id),
    spotify_images: formatListBack(spotify_images),
    spotify_images_colors: formatListBack(spotify_images_colors),
    deezer_image: valueOrNull(deezer_image),
    deezer_images_colors: formatListBack(deezer_images_colors),
    genres: formatListBack(genres),
    popularity: null,
    cached_at
  }
}
