import { chunkArray, flatArray, numerifyObject, stringifyObject } from '../utils/utils'
import messages from '../messages'
import findTrack, { formatDisplayTrack } from '../finders/track'
import { Context, Nullable, TrackResponse } from '../typings/common'
import { Signale } from 'signale'
import { TrackFeatures } from '@prisma/client'

const logger = new Signale({ scope: 'TrackFinder' })

const route = (ctx: Context) => {
  const {
    router,
    redis,
    prisma
  } = ctx

  router.post('/find/tracks', async (req, res) => {
    try {
      const { tracks } = req.body

      if (!tracks || !Array.isArray(tracks)) {
        return res
          .status(400)
          .json(messages.MISSING_PARAMS)
      }

      const showPreview = req.query.preview === 'true'
      const needsDeezer = req.query.deezer === 'true'

      logger.time('Find tracks with length of ' + tracks.length)

      const promises = tracks.map(t => findTrack(ctx, t, showPreview, needsDeezer))

      let result = await Promise.all(promises)

      if (req.query.analysis === 'true') {
        result = await handleAnalysis(ctx, result)
      }

      logger.timeEnd('Find tracks with length of ' + tracks.length)

      res.json(result)
    } catch (e) {
      logger.error(e)
      res.status(500).json(messages.INTERNAL_ERROR)
    }
  })

  router.get('/tracks', async (req, res) => {
    const tracksQuery = req.query.tracks
    if (!tracksQuery) {
      return res
        .status(400)
        .json(messages.MISSING_PARAMS)
    }
    const tracks = tracksQuery.toString().split(',')

    if (!tracks || !Array.isArray(tracks)) {
      return res
        .status(400)
        .json(messages.MISSING_PARAMS)
    }

    let result = await Promise.all(tracks.map(async track => {
      try {
        const cache = await redis.getTrack(track)
        if (cache) {
          return formatDisplayTrack(cache)
        } else {
          const found = await prisma.track.findUnique({
            where: { hash: track }
          })
          return found ? formatDisplayTrack(found) : null
        }
      } catch (e) {
        logger.error(e)
        return null
      }
    }))

    if (req.query.analysis === 'true') {
      result = await handleAnalysis(ctx, result)
    }

    res.json({
      tracks: result
    })
  })
}

async function handleAnalysis (
  { prisma, redis, queueController, spotifyApi }: Context,
  tracks: Nullable<TrackResponse>[]
): Promise<TrackResponse[]> {
  const analysis = new Map<string, Nullable<TrackFeatures>>()

  await Promise.all(tracks.map(async track => {
    if (!track) {
      return null
    }

    const hash = track.hash
    const cached = await redis.getTrackFeatures(hash)

    if (cached) {
      analysis.set(hash, cached)
    } else {
      const features = await spotifyApi.getAudioFeaturesForTrack(track.spotify_id)
      analysis.set(hash, features)
      await redis.setTrackFeatures(hash, features)
    }
  }))

  for (const track of tracks) {
    if (track && track.spotify_id) {
      const exists = await redis.client.exists(`track-analysis:${track.spotify}`)
      if (exists) {
        track.analysis = numerifyObject(await redis.client.hgetall(`track-analysis:${track.spotify}`))
      } else {
        const data = await database.getTrackFeatures(track.spotify)
        if (data) {
          redis.client.hmset(`track-analysis:${track.spotify}`, stringifyObject(data))
          track.analysis = data
        } else {
          ids.push(track.spotify)
        }
      }
    }

    if (track && track.analysis) delete track.analysis._id
  }

  const chunked = chunkArray(ids, 50)
  console.log(ids)

  const res = await Promise.all(
    chunked.map(c => queueController.queueTask(QueueSource.SPOTIFY, () => spotifyApi.getAudioFeatures(c)))
  )

  const audiosFeatures = flatArray(res.map(r => r.audio_features))
  const objs = new Map()

  for (const features of audiosFeatures) {
    if (!features) continue
    const obj = {
      energy: features.energy,
      danceability: features.danceability,
      speechiness: features.speechiness,
      instrumentalness: features.instrumentalness,
      valence: features.valence,
      tempo: features.tempo
    }
    objs.set(features.id, obj)
    await redis.client.hmset(`track-analysis:${features.id}`, stringifyObject(obj))
    database.insertTrackFeatures(features.id, obj)
  }

  return tracks.map(track => {
    if (!track) return null
    if (track.analysis) return track

    return {
      ...track,
      analysis: objs.get(track.spotify)
    }
  })
}

export default route
