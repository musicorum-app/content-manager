import { Tedis } from 'tedis'
import { Signale } from 'signale'
import config from '../../config.json'
import { Album, Track, TrackFeatures } from '@prisma/client'
import { stringifyObject } from '../utils/utils'
import { DataSource, Nullable } from '../typings/common'
import { ArtistWithImageResources } from '../finders/artist'
import { AlbumWithImageResources } from '../finders/album'
import { TrackWithImageResources } from '../finders/track'

export default class RedisClient {
  private logger: Signale
  public client?: Tedis

  constructor () {
    this.logger = new Signale({ scope: 'Redis' })
  }

  public async init (): Promise<void> {
    this.logger.info('Starting service')

    return new Promise((resolve) => {
      this.client = new Tedis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASS
      })

      this.client.on('connect', () => {
        resolve()
        this.logger.success('Connected to redis')
      })
      this.client.on('error', e => {
        this.logger.error('Error connecting to redis', e)
        process.exit(1)
      })
      this.client.on('timeout', () => {
        this.logger.error('Timeout connecting to redis')
      })
      this.client.on('close', () => {
        this.logger.error('Connection to redis closed')
      })
    })
  }

  public async setArtist (key: string, artist: ArtistWithImageResources) {
    // await this.client?.hmset(key, stringifyObject(artist))
    await this.client?.set(key, JSON.stringify(artist))
    await this.client?.expire(key, config.expiration.artists)
  }

  public async setAlbum (key: string, album: Album) {
    await this.client?.set(key, JSON.stringify(album))
    await this.client?.expire(key, config.expiration.albums)
  }

  public async setTrack (key: string, track: Track) {
    await this.client?.set(key, JSON.stringify(track))
    await this.client?.expire(key, config.expiration.tracks)
  }

  public async setTrackFeatures (key: string, features: TrackFeatures) {
    await this.client?.hmset(key + ':features', stringifyObject(features))
    await this.client?.expire(key + ':features', config.expiration.tracks)
  }

  public async getTrack (hash: string): Promise<TrackWithImageResources | null> {
    const track = await this.client?.get(hash)
    await this.checkIfIsNull(hash)
    return track && typeof track === 'string' && track !== '' ? JSON.parse(track) as unknown as TrackWithImageResources : null
  }

  public async getTrackFeatures (hash: string): Promise<TrackFeatures | null> {
    const features = await this.client?.hgetall(hash + ':features')
    if (Object.keys(features || {}).length === 0) await this.checkIfIsNull(hash)
    return features && features !== {} ? this.convertNulls(features) as unknown as TrackFeatures : null
  }

  public async getAlbum (hash: string): Promise<AlbumWithImageResources | null> {
    const artist = await this.client?.get(hash)
    await this.checkIfIsNull(hash)
    return artist && typeof artist === 'string' && artist !== '' ? JSON.parse(artist) as unknown as AlbumWithImageResources : null
  }

  public async getArtist (hash: string): Promise<ArtistWithImageResources | null> {
    const artist = await this.client?.get(hash)
    await this.checkIfIsNull(hash)
    return artist && typeof artist === 'string' && artist !== '' ? JSON.parse(artist) as unknown as ArtistWithImageResources : null
  }

  public async setPopularity (spotifyId: string, value: number): Promise<void> {
    const key = `${spotifyId}:spotify-popularity`
    await this.client?.set(key, value.toString())
    await this.client?.expire(key, config.expiration.popularity)
  }

  public async getPopularity (hash: string): Promise<number | null> {
    const key = `${hash}:spotify-popularity`
    const value = await this.client?.get(key)

    return value ? parseInt(value.toString()) : null
  }

  public async checkIfIsNull (hash: string, source?: DataSource): Promise<void> {
    if (await this.client?.exists(this.createNotFoundKey(hash, source || '_'))) throw new NotFoundError()
  }

  public checkIfIsNotFound (hash: string, source: DataSource): Promise<boolean> {
    return new Promise(resolve => {
      this.checkIfIsNull(hash, source)
        .then(() => resolve(false))
        .catch(() => resolve(true))
    })
  }

  public async setAsNotFound (hash: string, source: DataSource) {
    await this.client?.set(this.createNotFoundKey(hash, source), '1')
    await this.client?.expire(hash, config.expiration.notFound)
  }

  public createNotFoundKey (key: string, source: string): string {
    return `${source}:${key}::::nf`
  }

  public convertNulls (obj: Record<string, unknown>): Record<string, Nullable<unknown>> {
    const newObj = {} as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      newObj[k] = (v === 'null') ? null : v
    }
    return newObj
  }
}

export class NotFoundError extends Error {
  constructor () {
    super('NotFoundError')
    this.name = 'NotFoundError'
  }
}
