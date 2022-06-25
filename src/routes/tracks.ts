import { chunkArray, doNothing, flatArray, parseSourcesList } from '../utils/utils'
import messages from '../messages'
import findTrack, { formatDisplayTrack } from '../finders/track'
import { Context, DataSource, Nullable, TrackFeaturesResponse, TrackResponse } from '../typings/common'
import { Signale } from 'signale'
import { TrackFeatures } from '@prisma/client'
import { QueueSource } from '../queue/sources'
import { resolveResourcePalette } from '../modules/palette'

const logger = new Signale({ scope: 'TrackFinder' })

const route = (ctx: Context) => {
  const {
    router
  } = ctx

  router.post('/find/tracks', async (req, res) => {
    const end = ctx.monitoring.metrics.requestHistogram.labels({
      endpoint: '/find/tracks'
    }).startTimer()
    try {
      const { tracks } = req.body

      if (!tracks || !Array.isArray(tracks)) {
        return res
          .status(400)
          .json(messages.MISSING_PARAMS)
      }

      const sources = parseSourcesList(req.query.sources)
      if (sources.length === 0) {
        sources[0] = DataSource.Spotify
      }

      logger.time('Find tracks with length of ' + tracks.length)
      const retrievePalette = req.query.palette === 'true'
      const preview = req.query.preview === 'true'

      const promises = tracks.map(
        t => findTrack(ctx, t, preview, sources)
          .then(async track => {
            if (!track) return null
            if (retrievePalette) {
              if (await resolveResourcePalette(ctx, track.track_image_resource)) {
                await ctx.redis.setTrack(track.hash, track)
              }
            }
            return formatDisplayTrack(track)
          })
      )

      let result = await Promise.all(promises)

      if (req.query.features === 'true') {
        result = await handleFeatures(ctx, result)
      }

      logger.timeEnd('Find tracks with length of ' + tracks.length)

      res.json(result)
      ctx.monitoring.metrics.findersCounter.labels({ type: 'tracks' }).inc()
    } catch (e) {
      logger.error(e)
      res.status(500).json(messages.INTERNAL_ERROR)
    }
    end()
  })
  /* router.get('/tracks', async (req, res) => {
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
    }) */
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
    let cached = await redis.getTrackFeatures(spotify_id)

    if (!cached || !cached.danceability) {
      cached = await prisma.trackFeatures.findUnique({
        where: {
          spotify_id
        }
      })
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
      features.set(spotify_id, null)
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

    prisma.trackFeatures.createMany({
      data: flatArray(entries),
      skipDuplicates: true
    }).then(() => logger.info(`${entries.length} track features saved.`))
  })
}

export default route
