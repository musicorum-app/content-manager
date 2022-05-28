import { Tedis } from 'tedis'
import { Signale } from 'signale'
import config from '../../config.json'
import { Album, Artist, Track, TrackFeatures } from '@prisma/client'
import { stringifyObject } from '../utils/utils'
import { ArtistResponse, MaybePrimitiveValues, Nullable } from '../typings/common'
import { ArtistWithImageResources } from '../finders/artist'

export default class RedisClient {
  private logger: Signale
  public client?: Tedis

  constructor () {
    this.logger = new Signale({ scope: 'Redis' })
  }

  public async init (): Promise<void> {
    this.logger.info('Starting service')

    return new Promise((resolve, reject) => {
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
        reject(e)
        this.logger.error('Error connecting to redis', e)
        process.exit(1)
      })
    })
  }

  public async setArtist (key: string, artist: ArtistWithImageResources) {
    // await this.client?.hmset(key, stringifyObject(artist))
    await this.client?.set(key, JSON.stringify(artist))
    await this.client?.expire(key, config.expiration.artists)
  }

  public async setAlbum (key: string, album: Album) {
    await this.client?.hmset(key, stringifyObject(album))
    await this.client?.expire(key, config.expiration.albums)
  }

  public async setTrack (key: string, track: Track) {
    await this.client?.hmset(key, stringifyObject(track))
    await this.client?.expire(key, config.expiration.tracks)
  }

  public async setTrackFeatures (key: string, features: TrackFeatures) {
    await this.client?.hmset(key + ':features', stringifyObject(features))
    await this.client?.expire(key + ':features', config.expiration.tracks)
  }

  public async getTrack (hash: string): Promise<Track | null> {
    const track = await this.client?.hgetall(hash)
    if (Object.keys(track || {}).length === 0) await this.checkIfIsNull(hash)
    return track && track !== {} ? this.convertNulls(track) as unknown as Track : null
  }

  public async getTrackFeatures (hash: string): Promise<TrackFeatures | null> {
    const features = await this.client?.hgetall(hash + ':features')
    if (Object.keys(features || {}).length === 0) await this.checkIfIsNull(hash)
    return features && features !== {} ? this.convertNulls(features) as unknown as TrackFeatures : null
  }

  public async getAlbum (hash: string): Promise<Album | null> {
    const album = await this.client?.hgetall(hash)
    if (Object.keys(album || {}).length === 0) await this.checkIfIsNull(hash)
    return album && album !== {} ? this.convertNulls(album) as unknown as Album : null
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

  public async checkIfIsNull (hash: string): Promise<void> {
    if (await this.client?.exists(this.createNotFoundKey(hash))) throw new NotFoundError()
  }

  public chechIfIsNotFound (hash: string): Promise<boolean> {
    return new Promise(resolve => {
      this.checkIfIsNull(hash)
        .then(() => resolve(false))
        .catch(() => resolve(true))
    })
  }

  public async setAsNotFound (hash: string) {
    await this.client?.set(this.createNotFoundKey(hash), '1')
    await this.client?.expire(hash, config.expiration.notFound)
  }

  public createNotFoundKey (key: string): string {
    return `${key}::::nf`
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
