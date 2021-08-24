import QueueSource from '../queue/QueueSource'
import { chunkArray, flatArray, numerifyObject, stringifyObject } from '../utils/utils'
import messages from '../messages'
import findTrack from '../finders/track'

const route = (ctx) => {
  const { router, logger, redis, database } = ctx

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

      const promises = []

      tracks.forEach(track => {
        const task = findTrack(ctx, track, showPreview, needsDeezer)

        promises.push(task)
      })

      let result = await Promise.all(promises)

      if (req.query.analysis === 'true') {
        result = await handleAnalysis(ctx, result)
      }

      res.json(result)
    } catch (e) {
      logger.error(e)
      console.error(e)
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
    const tracks = tracksQuery.split(',')

    if (!tracks || !Array.isArray(tracks)) {
      return res
        .status(400)
        .json(messages.MISSING_PARAMS)
    }

    const result = await Promise.all(tracks.map(async track => {
      try {
        const cache = await redis.client.hgetall(track)
        if (Object.keys(cache).length) {
          return cache
        } else {
          return database.findTrack(track)
        }
      } catch (e) {
        console.error(e)
        return null
      }
    }))

    res.json({
      tracks: result.map(r => {
        if (!r) return null
        if (r.duration) r.duration = parseInt(r.duration + '')
        return r
      })
    })
  })
}

const handleAnalysis = async ({ database, redis, queueController, spotifyApi }, tracks) => {
  const ids = []
  for (const track of tracks) {
    if (track && track.spotify) {
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
