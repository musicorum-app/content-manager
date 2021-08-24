import { Signale } from 'signale'
import express from 'express'
import cors from 'cors'
import { version } from '../package.json'
import QueueController from './queue/QueueController'
import RedisClient from './redis/RedisClient'
import SpotifyAPI from './apis/Spotify'
// import routes from './routes'
import { Context } from './typings'
import messages from './messages'

export default class Main {
  private logger: Signale
  public app: express.Application
  public queueController: QueueController
  public redis: RedisClient
  public spotifyApi: SpotifyAPI

  constructor () {
    this.logger = new Signale({ scope: 'Main' })

    this.app = express()
    this.queueController = new QueueController()
    this.redis = new RedisClient()
    this.spotifyApi = new SpotifyAPI()
  }

  async init () {
    this.logger.info('Starting services')

    this.app.use(express.json())
    this.app.use(cors())

    this.app.use((_, res, next) => {
      res.append('Musicorum-Content-Manager-Version', version)
      next()
    })

    await this.initStuff()

    const router = await this.loadRoutes()

    this.app.use(router)
    this.app.use((_, res) => {
      res.json(messages.NOT_FOUND)
    })

    const port = process.env.PORT || 3000

    this.app.listen(port, () => {
      this.logger.success('Server listening on port :%s', port)
    })
  }

  private async initStuff () {
    await this.queueController.init()
    await this.redis.init()
  }

  private async loadRoutes () {
    const router = express.Router()
    const context: Context = {
      router,
      queueController: this.queueController,
      redis: this.redis,
      spotifyApi: this.spotifyApi
    }

    // for (const route of routes) {
    //   route(context)
    // }

    return router
  }
}
