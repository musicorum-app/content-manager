import messages from '../messages'
import { Context } from '../typings/common'
import { Album, Track } from '@prisma/client'
import { findAlbum } from '../finders/album'
import { Signale } from 'signale'

const logger = new Signale({ scope: 'AlbumFinder' })

const route = (ctx: Context) => {
  ctx.router.use('/find/albums', async (req, res) => {
    try {
      const { albums } = req.body

      if (!albums || !Array.isArray(albums)) {
        return res
          .status(400)
          .json(messages.MISSING_PARAMS)
      }
      logger.time('Find albums with length of ' + albums.length)

      const promises = albums.map(a => findAlbum(ctx, a))

      const result = await Promise.all(promises)

      logger.timeEnd('Find albums with length of ' + albums.length)

      res.json(result)
    } catch (e) {
      logger.error(e)
      res
        .status(500)
        .json(messages.INTERNAL_ERROR)
    }
  })
}

export default route
