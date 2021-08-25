import messages from '../messages'
import findAlbum from '../finders/album'
import { Context } from '../typings'

const route = (ctx: Context) => {
  ctx.router.use('/find/albums', async (req, res) => {
    try {
      const { albums } = req.body

      if (!albums || !Array.isArray(albums)) {
        return res
          .status(400)
          .json(messages.MISSING_PARAMS)
      }

      const promises: Promise<any>[] = []

      albums.forEach(track => {
        const task = findAlbum(ctx, track)

        promises.push(task)
      })

      const result = await Promise.all(promises)

      res.json(result)
    } catch (e) {
      logger.error(e)
    }
  })
}

export default route
