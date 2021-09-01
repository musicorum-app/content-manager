import { chunkArray, doNothing, flatArray, numerifyObject, stringifyObject } from '../utils/utils'
import messages from '../messages'
import findTrack, { formatDisplayTrack } from '../finders/track'
import { Context, Nullable, TrackFeaturesResponse, TrackResponse } from '../typings/common'
import { Signale } from 'signale'
import { TrackFeatures } from '@prisma/client'
import { QueueSource } from '../queue/sources'

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

      if (req.query.features === 'true') {
        result = await handleFeatures(ctx, result)
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

    if (req.query.features === 'true') {
      result = await handleFeatures(ctx, result)
    }

    res.json({
      tracks: result
    })
  })
}

async function handleFeatures (
  { prisma, redis, queueController, spotifyApi }: Context,
  tracks: Nullable<TrackResponse>[]
): Promise<Nullable<TrackResponse>[]> {
  const features = new Map<string, Nullable<TrackFeaturesResponse>>()

  await Promise.all(tracks.map(async track => {
    if (!track) return null
    if (!track.spotify_id) return null

    const { hash } = track
    let cached = await redis.getTrackFeatures(hash)

    if (!cached || !cached.danceability) {
      cached = await prisma.trackFeatures.findUnique({
        where: {
          track_hash: hash
        }
      })
      console.log(cached, hash)
    }

    if (cached && cached.danceability) {
      track.features = {
        danceability: Number(cached.danceability),
        energy: Number(cached.energy),
        instrumentalness: Number(cached.instrumentalness),
        speechiness: Number(cached.speechiness),
        tempo: Number(cached.tempo),
        valence: Number(cached.valence),
        acousticness: Number(cached.acousticness),
        liveness: Number(cached.liveness),
        loudness: Number(cached.loudness)
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      features.set(track.spotify_id!, null)
    }
  }))

  const keys = [...features.keys()]
  const chunked = chunkArray(keys, 50)

  const res: SpotifyAudioFeatures[][] = await Promise.all(
    chunked.map(c => queueController.queueTask<SpotifyAudioFeatures[]>(QueueSource.Spotify, () => spotifyApi.getAudioFeatures(c)))
  )

  const results = flatArray(res)

  for (let i = 0; i < results.length; i++) {
    const feature = results[i]
    const spotifyId = keys[i]

    const obj: TrackFeaturesResponse = {
      danceability: feature.danceability,
      energy: feature.energy,
      instrumentalness: feature.instrumentalness,
      speechiness: feature.speechiness,
      tempo: feature.tempo,
      valence: feature.valence,
      acousticness: feature.acousticness,
      liveness: feature.liveness,
      loudness: feature.loudness
    }

    features.set(spotifyId, obj)
  }

  return new Promise(resolve => {
    resolve(tracks.map(track => {
      if (!track || track.features || !track.spotify_id) return track

      const feat = features.get(track.spotify_id)
      if (feat) {
        track.features = feat
      }

      return track
    }))

    const entries = [...features.entries()]
      .map(([spotifyId, feature]) => {
        if (!feature) return null

        const hash = tracks.find(t => t?.spotify_id === spotifyId)?.hash
        if (!hash) return null

        const feat = {
          ...feature,
          track_hash: hash
        }

        redis.setTrackFeatures(hash, feat)
          .then(doNothing)

        return feat
      })
      .filter(f => !!f) as TrackFeatures[]

    console.log(entries)

    prisma.trackFeatures.createMany(
      {
        data: entries
      }
    )
      .then(doNothing)
  })
}

export default route
