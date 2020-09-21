import chalk from "chalk";
import QueueSource from "../queue/QueueSource";
import findArtist from "../finders/artist";

const route = (ctx) => {
  const {router, logger, queueController} = ctx

  router.use('/resource/artists', async (req, res) => {
    const { artists } = req.body
    const promises = []

    artists.forEach(artist => {
      logger.silly(chalk.cyan('Scheduling task ' + artist))

      const task = findArtist(ctx, artist)

      promises.push(task)
    })

    const result = await Promise.all(promises)

    res.json(result)
  })
}

export default route