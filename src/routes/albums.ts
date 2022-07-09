import messages from '../messages'
import { Context, DataSource } from '../typings/common'
import { findManyAlbums } from '../finders/album'
import { Signale } from 'signale'
import { parseSourcesList } from '../utils/utils'

const logger = new Signale({ scope: 'AlbumFinder' })

const route = (ctx: Context) => {
  ctx.router.use('/find/albums', async (req, res) => {
    const end = ctx.monitoring.metrics.requestHistogram.labels({
      endpoint: '/find/albums'
    }).startTimer()
    try {
      const { albums } = req.body

      if (!albums || !Array.isArray(albums)) {
        return res
          .status(400)
          .json(messages.MISSING_PARAMS)
      }
      logger.time('Find albums with length of ' + albums.length)
      const retrievePalette = req.query.palette === 'true'

      const sources = parseSourcesList(req.query.sources)
      if (sources.length === 0) {
        sources[0] = DataSource.Spotify
      }

      const result = await findManyAlbums(
        ctx,
        albums,
        sources,
        retrievePalette
      )

      // const promises = albums.map(
      //   a => findAlbum(ctx, a, sources)
      //     .then(async (album) => {
      //       if (!album) return null
      //       if (retrievePalette) {
      //         if (await resolveResourcePalette(ctx, album.album_image_resource)) {
      //           await ctx.redis.setAlbum(album.hash, album)
      //         }
      //       }
      //       return formatDisplayAlbum(album)
      //     })
      // )

      // const result = await Promise.all(promises)

      logger.timeEnd('Find albums with length of ' + albums.length)

      res.json(result)

      ctx.monitoring.metrics.findersCounter.labels({ type: 'albums' }).inc()
    } catch (e) {
      logger.error(e)
      res
        .status(500)
        .json(messages.INTERNAL_ERROR)
    }
    end()
  })
}

export default route
