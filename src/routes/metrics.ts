import { Context } from '../typings/common'

const route = (ctx: Context) => {
  const { router, monitoring } = ctx
  router.get('/metrics', async (req, res) => {
    res.contentType(monitoring.register.contentType)
    res.end(await monitoring.register.metrics())
  })
}

export default route
