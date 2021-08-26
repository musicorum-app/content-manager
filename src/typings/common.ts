import { PrismaClient } from '@prisma/client'
import { Router } from 'express'
import SpotifyAPI from '../apis/Spotify'
import QueueController from '../queue/QueueController'
import RedisClient from '../redis/RedisClient'

export type Nullable<T> = T | null

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

  deezer_cover: Nullable<string>
  deezer_covers_colors: string[]

  cached_at: string
}

export interface ArtistResponse {
  hash: string
  name: string

  spotify_id: Nullable<string>
  deezer_id: Nullable<string>

  spotify_images: string[]
  spotify_images_colors: string[]
  deezer_image: Nullable<string>
  deezer_images_colors: string[]

  genres: string[]
  popularity: Nullable<number>
  cached_at: string
}

export interface TrackRequestItem {
  name: string
  artist: string
  album?: string
}

export interface TrackResponse {
  hash: string
  name: string
  artists: string[]
  album: string

  spotify_id: Nullable<string>
  deezer_id: Nullable<string>
  genius_id: Nullable<string>

  spotify_covers: string[]
  spotify_covers_colors: string[]
  deezer_cover: Nullable<string>
  deezer_covers_colors: string[]

  duration: Nullable<number>
  preview: Nullable<string>
  cached_at: string
}
