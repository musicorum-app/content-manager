import { ImageResourceSource, ImageSize, PrismaClient } from '@prisma/client'
import { Router } from 'express'
import LastFM from 'lastfm-typed'
import SpotifyAPI from '../apis/Spotify'
import { Metrics } from '../modules/monitoring'
import QueueController from '../queue/QueueController'
import RedisClient from '../redis/RedisClient'

export type Nullable<T> = T | null

export enum DataSource {
  Spotify = 'spotify',
  Deezer = 'deezer',
  LastFM = 'lastfm'
}

export enum EntityType {
  Artist = 'artist',
  Album = 'album',
  Track = 'track'
}

export interface Config {
  sources: {
    [key: string]: number
  },
  expiration: {
    [key: string]: number
  }
}

export type MaybePrimitiveValues<O extends Record<string, unknown>>
  = O | Record<keyof O, string>

export interface Context {
  router: Router
  queueController: QueueController
  redis: RedisClient
  spotifyApi: SpotifyAPI
  prisma: PrismaClient
  lastfm: LastFM
  monitoring: Metrics
}

export type ImageResponse = {
  hash: string
  size: ImageSize
  url: string
}

// Resources response
export interface ImageResourceResponse {
  hash: string
  explicit: Nullable<boolean>
  active: boolean
  source: ImageResourceSource
  images: ImageResponse[]
  color_palette: {
    vibrant: Nullable<string>
    dark_vibrant: Nullable<string>
    light_vibrant: Nullable<string>
    muted: Nullable<string>
    dark_muted: Nullable<string>
    light_muted: Nullable<string>
  }
  created_at: string
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
  tags: string[]
  release_date: Nullable<string>

  spotify_id: Nullable<string>
  deezer_id: Nullable<number>

  resources: ImageResourceResponse[]
  preferred_resource: Nullable<string>

  created_at: string
  updated_at: Nullable<string>
}

export interface ArtistResponse {
  hash: string
  name: string

  spotify_id: Nullable<string>
  deezer_id: Nullable<number>

  genres: string[]
  tags: string[]
  similar: string[]
  popularity: Nullable<number>

  resources: ImageResourceResponse[]
  preferred_resource: Nullable<string>

  created_at: string
  updated_at: Nullable<string>
}

export interface TrackRequestItem {
  name: string
  artist: string
  album?: string
}

export interface TrackFeaturesResponse {
  danceability: number
  energy: number
  loudness: number
  speechiness: number
  acousticness: number
  instrumentalness: number
  liveness: number
  valence: number
  tempo: number
}

export interface TrackResponse {
  hash: string
  name: string
  artists: string[]
  album: Nullable<string>

  spotify_id: Nullable<string>
  deezer_id: Nullable<number>
  genius_id: Nullable<number>

  tags: string[]
  duration: Nullable<number>
  preview: Nullable<string>
  explicit: Nullable<boolean>

  resources: ImageResourceResponse[]
  preferred_resource: Nullable<string>

  created_at: string
  updated_at: Nullable<string>

  features: Nullable<TrackFeaturesResponse>
}
