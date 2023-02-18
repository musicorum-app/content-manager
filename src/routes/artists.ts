import { chunkArray, flatArray, parseSourcesList } from '../utils/utils'
import messages from '../messages'
import { ArtistResponse, Context, DataSource, Nullable } from '../typings/common'
import { Signale } from 'signale'
import { findManyArtists } from '../finders/artist'
import { QueueSource } from '../queue/sources'

const logger = new Signale({ scope: 'ArtistFinder' })

const route = (ctx: Context) => {
  ctx.router.use('/find/artists', async (req, res) => {
    const end = ctx.monitoring.metrics.requestHistogram.labels({
      endpoint: '/find/artists'
    }).startTimer()
    try {
      const { artists } = req.body
      if (!artists || !Array.isArray(artists)) {
        return res
          .status(400)
          .json(messages.MISSING_PARAMS)
      }
      logger.time('Find artists with length of ' + artists.length)
      const retrievePalette = req.query.palette === 'true'

      const sources = parseSourcesList(req.query.sources)
      if (sources.length === 0) {
        sources[0] = DataSource.LastFM
      }
      logger.time('S')
      let result = await findManyArtists(ctx, artists, sources, retrievePalette)
      logger.timeEnd('S')

      // const promises = artists.map(
      //   (a) => findArtist(ctx, a, sources)
      //     .then(async (artist) => {
      //       if (!artist) return null
      //       if (retrievePalette) {
      //         if (await resolveResourcePalette(ctx, artist.artist_image_resource)) {
      //           await ctx.redis.setArtist(artist.hash, artist)
      //         }
      //       }
      //       return formatDisplayArtist(artist)
      //     })
      // )

      // let result = await Promise.all(promises)

      const showPopularity = req.query.popularity === 'true'

      if (showPopularity) {
        result = await getPopularityForArtists(ctx, result)
      }
      logger.timeEnd('Find artists with length of ' + artists.length)

      res.json(result)

      ctx.monitoring.metrics.findersCounter.labels({ type: 'artists' }).inc()
    } catch (e) {
      logger.error(e)
      res
        .status(500)
        .json(messages.INTERNAL_ERROR)
    }
    end()
  })
}

const getPopularityForArtists = async ({
  redis,
  spotifyApi,
  queueController
}: Context, artists: Nullable<ArtistResponse>[]) => {
  const pops = new Map<string, Nullable<number>>()

  logger.time('Get popularity for artists')

  await Promise.all(artists.map(async artist => {
    if (artist && artist.spotify_id) {
      const pop = await redis.getPopularity(artist.spotify_id)
      if (pop) {
        artist.popularity = pop
      } else {
        pops.set(artist.spotify_id, null)
      }
    }
  }))

  logger.timeEnd('Get popularity for artists')

  const chunked = chunkArray([...pops.keys()], 50)

  const res: SpotifyMultipleArtistsResponse[] = await Promise.all(
    chunked.map(c => queueController.queueTask<SpotifyMultipleArtistsResponse>(QueueSource.Spotify, () => spotifyApi.getArtists(c)))
  )

  for (const artist of flatArray(res.map(r => r.artists))) {
    redis.setPopularity(artist.id, artist.popularity)
    pops.set(artist.id, artist.popularity)
  }

  return artists.map(artist => {
    if (!artist) return null
    if (artist.popularity || !artist.spotify_id) return artist

    const find = pops.get(artist.spotify_id)

    return {
      ...artist,
      popularity: find || null
    }
  })
}

export default route
