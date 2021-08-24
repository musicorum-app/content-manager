import { Router } from 'express'
import SpotifyAPI from './apis/Spotify'
import QueueController from './queue/QueueController'
import RedisClient from './redis/RedisClient'

interface Config {
  sources: {
    [key: string]: number
  },
  expiration: {
    [key: string]: number
  }
}

interface Context {
  router: Router
  queueController: QueueController
  redis: RedisClient
  spotifyApi: SpotifyAPI
}
