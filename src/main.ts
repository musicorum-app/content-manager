import { Signale } from 'signale'
import express from 'express'
import cors from 'cors'
import { version } from '../package.json'
import QueueController from './queue/QueueController'
import RedisClient from './redis/RedisClient'
import SpotifyAPI from './apis/Spotify'
// import routes from './routes'
import messages from './messages'
import { Context } from './typings/common'
import { PrismaClient } from '@prisma/client'
import routes from './routes'
import LastFM from 'lastfm-typed'
import monitoring, { Metrics } from './modules/monitoring'

export default class Main {
  private logger: Signale
  public app: express.Application
  public queueController: QueueController
  public redis: RedisClient
  public spotifyApi: SpotifyAPI
  public prisma: PrismaClient
  public lastfm: LastFM
  public monitoring: Metrics

  constructor () {
    this.logger = new Signale({ scope: 'Main' })

    if (!process.env.LASTFM_KEY) {
      throw new Error('Lastfm client key is required')
    }

    this.app = express()
    this.queueController = new QueueController()
    this.redis = new RedisClient()
    this.spotifyApi = new SpotifyAPI()
    this.prisma = new PrismaClient()
    this.monitoring = monitoring
    this.lastfm = new LastFM(process.env.LASTFM_KEY, {
      secureConnection: true,
      userAgent: 'MusicorumContentManager/' + version
    })
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
      spotifyApi: this.spotifyApi,
      prisma: this.prisma,
      lastfm: this.lastfm,
      monitoring: this.monitoring
    }

    for (const route of routes) {
      route(context)
    }

    return router
  }
}
