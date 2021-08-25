import { PrismaClient } from '@prisma/client'
import { Router } from 'express'
import SpotifyAPI from '../apis/Spotify'
import QueueController from '../queue/QueueController'
import RedisClient from '../redis/RedisClient'

type Nullable<T> = T | null

export interface Config {
  sources: {
    [key: string]: number
  },
  expiration: {
    [key: string]: number
  }
}

export interface Context {
  router: Router
  queueController: QueueController
  redis: RedisClient
  spotifyApi: SpotifyAPI,
  prisma: PrismaClient
}

// Albums

export interface AlbumRequestItem {
  name: string,
  artist: string
}

export interface AlbumResponse {
  hash: string
  name: string
  artists: string[]
  release_date: Nullable<string>

  spotify_id: Nullable<string>
  deezer_id: Nullable<string>

  spotify_covers: string[]
  spotify_covers_colors: string[]

  deezer_covers: string[]
  deezer_covers_colors: string[]

  cached_at: string
}
