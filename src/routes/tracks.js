import chalk from "chalk";
import QueueSource from "../queue/QueueSource";
import findArtist from "../finders/artist";
import {chunkArray, flatArray} from "../utils/utils";
import messages from "../messages";
import findTrack from "../finders/track";

const route = (ctx) => {
  const {router, logger} = ctx

  router.use('/resource/tracks', async (req, res) => {
    const {tracks} = req.body

    if (!tracks || !Array.isArray(tracks)) return res
      .status(400)
      .json(messages.MISSING_PARAMS)

    const promises = []

    tracks.forEach(track => {
      logger.silly(chalk.cyan('Scheduling track task ' + track.name))

      const task = findTrack(ctx, track)

      promises.push(task)
    })

    let result = await Promise.all(promises)

    res.json(result)
  })
}

export default route