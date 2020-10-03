import chalk from "chalk";
import QueueSource from "../queue/QueueSource";
import findArtist from "../finders/artist";
import {chunkArray, flatArray} from "../utils/utils";
import messages from "../messages";

const route = (ctx) => {
  const {router, logger} = ctx

  router.use('/find/artists', async (req, res) => {
    const {artists} = req.body
    if (!artists || !Array.isArray(artists)) return res
      .status(400)
      .json(messages.MISSING_PARAMS)
    const promises = []

    const showPopularity = req.query.popularity === 'true'

    artists.forEach(artist => {
      logger.silly(chalk.cyan('Scheduling task ' + artist))

      const task = findArtist(ctx, artist)

      promises.push(task)
    })

    let result = await Promise.all(promises)

    if (showPopularity) {
      result = await getPopularityForArtists(ctx, result)
    }

    res.json(result)
  })
}

const getPopularityForArtists = async ({redis, spotifyApi, queueController}, artists) => {
  const ids = []
  for (const artist of artists) {
    if (artist && artist.spotify) {
      const pop = await redis.client.get(`spotify-popularity:${artist.spotify}`)
      if (pop) {
        artist.popularity = Number(pop)
      } else {
        ids.push(artist.spotify)
      }
    }
  }

  const chunked = chunkArray(ids, 50)

  const res = await Promise.all(
    chunked.map(c => queueController.queueTask(QueueSource.SPOTIFY, () => spotifyApi.getArtists(c)))
  )

  const objs = flatArray(res.map(r => r.artists))
  for (const artist of objs) {
    redis.client.set(`spotify-popularity:${artist.id}`, artist.popularity.toString())
  }

  return artists.map(artist => {
    if (!artist) return null
    if (artist.popularity) return artist

    const find = objs.find(a => a.id === artist.spotify)

    return {
      ...artist,
      popularity: find ? find.popularity : null
    }
  })
}

export default route