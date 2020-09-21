import express from 'express'
import messages from "./messages"
import setupLogger from "./utils/logger"
import chalk from "chalk"
import QueueController from "./queue/QueueController"
import {readdir} from 'fs'
import {promisify} from 'util'
import path from 'path'

const readDirAsync = promisify(readdir)
import config from '../config.json'
import SpotifyAPI from "./apis/Spotify";
import RedisClient from "./redis/RedisClient";
import DatabaseClient from "./database/DatabaseClient";

import artistsRoute from './routes/artists'

const app = express()
const logger = setupLogger()
const clientCtx = {logger, config}

const queueController = new QueueController(clientCtx)
const redis = new RedisClient(clientCtx)
const database = new DatabaseClient(clientCtx)
const spotifyApi = new SpotifyAPI()

app.use(express.json())


const loadRoutes = async () => {
  const routes = [artistsRoute]
  const router = express.Router()
  for (let route of routes) {
    route({
      router,
      logger,
      queueController,
      spotifyApi,
      redis,
      database
    })
  }

  return router
}


const port = process.env.PORT || 80

loadRoutes()
  .then(router => app.use(router))
  .then(() => {
    app.use((req, res) => {
      res.json(messages.NOT_FOUND)
    })

    app.listen(port, () => {
      logger.info(`Server listening on port ${chalk.cyan(':' + port)}`)
    })
  })