import DeezerAPI from '../apis/Deezer'
import { Context, TrackRequestItem, TrackResponse } from '../typings/common'
import { NotFoundError } from '../redis/RedisClient'
import { Signale } from 'signale'
import { hashTrack } from '../utils/hashing'
import { Track } from '@prisma/client'
import { doNothing, formatList, formatListBack, normalizeString, valueOrNull } from '../utils/utils'
import { QueueSource } from '../queue/sources'

const logger = new Signale({ scope: 'TrackFinder' })

async function findTrack (
  ctx: Context,
  { name, artist, album }: TrackRequestItem,
  showPreview: boolean,
  needsDeezer: boolean
): Promise<TrackResponse | null> {
  const {
    spotifyApi,
    redis,
    prisma,
    queueController
  } = ctx

  try {
    const hash = hashTrack(name, artist, album || '')

    const exists = await redis.getTrack(hash)
    if (exists && exists.hash) {
      return formatDisplayTrack(await resolveTrack(ctx, exists, showPreview, needsDeezer))
    } else {
      const found = await prisma.track.findUnique({
        where: {
          hash
        }
      })

      if (found) {
        redis.setTrack(hash, found)
          .then(doNothing)
        return formatDisplayTrack(await resolveTrack(ctx, found, showPreview, needsDeezer))
      } else {
        logger.time(`Track task for ${name}`)
        const albumAdc = album ? ` album:${album}` : ''
        const res = await queueController.queueTask<SpotifySearchResponse>(
          QueueSource.Spotify,
          () => spotifyApi.searchTrack(`"${name}" artist:${artist}${albumAdc}`)
        )

        if (res.tracks?.items.length === 0) {
          redis.setAsNotFound(hash)
          return null
        }

        let selected = res.tracks?.items.find(t => normalizeString(t.name) === normalizeString(name)) as SpotifyTrack

        if (!selected) {
          selected = res.tracks?.items[0] as SpotifyTrack
        }

        let item: Track = {
          hash,
          name: selected.name,
          artists: formatList(selected.artists.map(a => a.name)),
          album: selected.album.name,
          spotify_id: selected.id,
          deezer_id: null,
          genius_id: null,
          duration: selected.duration_ms,
          spotify_covers: formatList(selected.album.images.map(i => i.url)),
          spotify_covers_colors: null,
          deezer_cover: null,
          deezer_covers_colors: null,
          preview: selected.preview_url || null,
          cached_at: (new Date().getTime()).toString()
        }

        await prisma.track.create({
          data: item
        })

        item = await resolveTrack(ctx, item, showPreview, needsDeezer)

        await redis.setTrack(hash, item)
        return formatDisplayTrack(item)
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

function resolveTrack (
  ctx: Context,
  track: Track,
  showPreview: boolean,
  needsDeezer: boolean
): Promise<Track> {
  return resolveDeezer(ctx, needsDeezer, track)
    .then(track => resolvePreview(ctx, showPreview, track))
}

async function resolvePreview (ctx: Context, showPreview: boolean, track: Track): Promise<Track> {
  if (!showPreview) return track
  if (track.preview) return track

  return resolveDeezer(ctx, true, track)
}

async function resolveDeezer (
  { queueController, prisma, redis }: Context,
  needsDeezer: boolean,
  track: Track
): Promise<Track> {
  if (!needsDeezer) return track
  if (track.deezer_id) return track

  if (await redis.chechIfIsNotFound(`${track.hash}:deezer-match`)) return track

  const {
    data: [res]
  } = await queueController.queueTask<DeezerTrackSearch>(
    QueueSource.Deezer,
    () => DeezerAPI.searchTrack(track.name, formatListBack(track.artists)[0], track.album)
  )

  if (!res) {
    await redis.setAsNotFound(`${track.hash}:deezer-match`)
    return track
  }

  track.deezer_id = res.id.toString()
  track.preview = res.preview
  track.deezer_cover = res.md5_image

  await prisma.track.update({
    where: { hash: track.hash },
    data: {
      deezer_id: track.deezer_id,
      deezer_cover: track.deezer_cover,
      preview: track.preview
    }
  })

  await redis.setTrack(track.hash, track)

  return track
}

export function formatDisplayTrack (
  {
    hash,
    name,
    album,
    artists,
    spotify_id,
    deezer_id,
    genius_id,
    spotify_covers,
    spotify_covers_colors,
    deezer_cover,
    deezer_covers_colors,
    duration,
    preview,
    cached_at
  }: Track
): TrackResponse {
  return {
    hash,
    name,
    album,
    artists: formatListBack(artists),
    spotify_id: valueOrNull(spotify_id),
    deezer_id: valueOrNull(deezer_id),
    genius_id: valueOrNull(genius_id),
    spotify_covers: formatListBack(spotify_covers),
    spotify_covers_colors: formatListBack(spotify_covers_colors),
    deezer_cover: valueOrNull(deezer_cover),
    deezer_covers_colors: formatListBack(deezer_covers_colors),
    duration: Number(duration),
    preview: valueOrNull(preview),
    features: null,
    cached_at
  }
}

export default findTrack
