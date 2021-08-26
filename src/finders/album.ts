import { Album } from '@prisma/client'
import { Signale } from 'signale'
import { QueueSource } from '../queue/sources'
import { NotFoundError } from '../redis/RedisClient'
import { AlbumRequestItem, AlbumResponse, Context } from '../typings/common'
import { hashAlbum } from '../utils/hashing'
import { doNothing, formatList, formatListBack, normalizeString, valueOrNull } from '../utils/utils'

const logger = new Signale({ scope: 'AlbumFinder' })

export async function findAlbum (
  {
    spotifyApi,
    redis,
    queueController,
    prisma
  }: Context, { name, artist }: AlbumRequestItem): Promise<AlbumResponse | null> {
  try {
    const hash = hashAlbum(name, artist)

    const exists = await redis.getAlbum(hash)
    if (exists && exists.hash) {
      return formatDisplayAlbum(exists)
    } else {
      const found = await prisma.album.findUnique({
        where: {
          hash
        }
      })

      if (found) {
        redis.setAlbum(hash, found)
        return formatDisplayAlbum(found)
      } else {
        logger.time(`Album task for ${name}`)
        const res = await queueController.queueTask<SpotifySearchResponse>(
          QueueSource.Spotify,
          () => spotifyApi.searchAlbum(name, artist)
        )

        logger.timeEnd(`Album task for ${name}`)

        if (res.albums?.items.length === 0) {
          redis.setAsNotFound(hash)
          return null
        }

        let selected = res.albums?.items.find(a => normalizeString(a.name) === normalizeString(name)) as SpotifyAlbum

        if (!selected) {
          selected = res.albums?.items[0] as SpotifyAlbum
        }

        const item: Album = {
          hash,
          name: selected.name,
          artists: formatList(selected.artists.map(a => a.name)),
          spotify_id: selected.id,
          spotify_covers: formatList(selected.images.map(i => i.url)),
          cached_at: (new Date().getTime()).toString(),
          deezer_cover: null,
          deezer_covers_colors: null,
          deezer_id: null,
          release_date: selected.release_date || null,
          spotify_covers_colors: null
        }

        redis.setAlbum(hash, item)
        prisma.album.create({
          data: item
        })
          .then(() => doNothing()) // Nothing function in order to trigger the async function but without having to block the function with await
          .catch(err => logger.error(err))
        return formatDisplayAlbum(item)
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

function formatDisplayAlbum ({
  hash,
  name,
  artists,
  release_date,
  spotify_id,
  spotify_covers,
  spotify_covers_colors,
  deezer_cover,
  deezer_covers_colors,
  deezer_id,
  cached_at
}: Album): AlbumResponse {
  return {
    hash: hash,
    name: name,
    artists: formatListBack(artists),
    release_date: valueOrNull(release_date),
    spotify_id: valueOrNull(spotify_id),
    deezer_id: valueOrNull(deezer_id),
    spotify_covers: formatListBack(spotify_covers),
    spotify_covers_colors: formatListBack(spotify_covers_colors),
    deezer_cover: valueOrNull(deezer_cover),
    deezer_covers_colors: formatListBack(deezer_covers_colors),
    cached_at: cached_at
  }
}
