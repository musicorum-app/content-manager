import { chunkArray, flatArray } from '../utils/utils'
import messages from '../messages'
import { ArtistResponse, Context, Nullable } from '../typings/common'
import { Signale } from 'signale'
import { findArtist } from '../finders/artist'
import { QueueSource } from '../queue/sources'

const logger = new Signale({ scope: 'ArtistFinder' })

const route = (ctx: Context) => {
  ctx.router.use('/find/artists', async (req, res) => {
    try {
      const { artists } = req.body
      if (!artists || !Array.isArray(artists)) {
        return res
          .status(400)
          .json(messages.MISSING_PARAMS)
      }
      logger.time('Find artists with length of ' + artists.length)

      const promises = artists.map(a => findArtist(ctx, a))

      let result = await Promise.all(promises)

      const showPopularity = req.query.popularity === 'true'

      if (showPopularity) {
        result = await getPopularityForArtists(ctx, result)
      }
      logger.timeEnd('Find artists with length of ' + artists.length)

      res.json(result)
    } catch (e) {
      logger.error(e)
      res
        .status(500)
        .json(messages.INTERNAL_ERROR)
    }
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

  logger.debug(pops)

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
