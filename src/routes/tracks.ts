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

      logger.time('Find tracks')
      let result = await Promise.all(promises)
      logger.timeEnd('Find tracks')

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

    const { spotify_id } = track
    const r = Math.random() * 100
    logger.time(`Redis search for ${spotify_id} (${r})`)
    let cached = await redis.getTrackFeatures(spotify_id)
    logger.timeEnd(`Redis search for ${spotify_id} (${r})`)

    if (!cached || !cached.danceability) {
      logger.time(`Postgres search for ${spotify_id} (${r})`)
      cached = await prisma.trackFeatures.findUnique({
        where: {
          spotify_id
        }
      })
      logger.timeEnd(`Postgres search for ${spotify_id} (${r})`)
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
    } else if (!features.has(spotify_id)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      features.set(track.spotify_id!, null)
      logger.debug('%s => (%s) feats: %s', track.hash, track.spotify_id, cached)
    }
  }))

  if (features.size === 0) {
    return tracks
  } else {
    logger.time(`Starting to fetch track features of length ${features.size}`)
  }

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

        const _tracks = tracks.filter(t => t?.spotify_id === spotifyId)
        if (_tracks.length === 0) return null

        const feats = []

        for (const track of _tracks) {
          if (!track || !track.spotify_id) continue

          const feat = {
            ...feature,
            spotify_id: track.spotify_id
          }

          feats.push(feat)

          redis.setTrackFeatures(track.spotify_id, feat)
            .then(doNothing)
        }

        return feats
      })
      .filter(f => !!f) as TrackFeatures[][]

    prisma.trackFeatures.createMany(
      {
        data: flatArray(entries)
      }
    )
      .then(doNothing)
      .catch(async e => {
        logger.error('Could not insert track features into database as many. Trying one by one', e)

        for (const feat of flatArray(entries)) {
          await prisma.trackFeatures.create({
            data: feat
          })
            .then(doNothing)
            .catch(e => {
              logger.error('Could not insert track features into database', e)
            })
        }
      })
      .finally(() => {
        logger.time(`Starting to fetch track features of length ${features.size}`)
      })
  })
}

export default route
