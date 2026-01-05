import { Signale } from 'signale'
import config from '../../config.json'
import { Album, Track, TrackFeatures } from '@prisma/client'
import { stringifyObject } from '../utils/utils'
import { DataSource, EntityType, Nullable } from '../typings/common'
import { ArtistWithImageResources } from '../finders/artist'
import { AlbumWithImageResources } from '../finders/album'
import { TrackWithImageResources } from '../finders/track'
import { createClient, RedisClientType } from 'redis'

const entityPrefix = {
  [EntityType.Artist]: 'AR:',
  [EntityType.Album]: 'AL:',
  [EntityType.Track]: 'TR:'
}

export default class RedisClient {
  private logger: Signale
  public client?: RedisClientType

  constructor () {
    this.logger = new Signale({ scope: 'Redis' })
  }

  public async init (): Promise<void> {
    this.logger.info('Starting service')

    return new Promise((resolve) => {
      this.client = createClient({
        url: `redis://:${process.env.REDIS_PASS}@${process.env.REDIS_HOST}:${parseInt(process.env.REDIS_PORT || '6379')}`
      })

      // @ts-expect-error wrong event type
      this.client.on('connect', () => {
        resolve()
        this.logger.success('Connected to redis')
      })
      // @ts-expect-error wrong event type
      this.client.on('error', e => {
        this.logger.error('Error connecting to redis', e)
        process.exit(1)
      })
      // @ts-expect-error wrong event type
      this.client.on('end', () => {
        this.logger.error('Connection to redis closed')
      })

      return this.client.connect()
    })
  }

  public async setArtist (key: string, artist: ArtistWithImageResources) {
    // await this.client?.hmset(key, stringifyObject(artist))
    key = this.createKey(key, EntityType.Artist)

    await this.client?.set(key, JSON.stringify(artist))
    await this.client?.expire(key, config.expiration.artists)
  }

  public async setAlbum (key: string, album: Album) {
    key = this.createKey(key, EntityType.Album)

    await this.client?.set(key, JSON.stringify(album))
    await this.client?.expire(key, config.expiration.albums)
  }

  public async setTrack (key: string, track: Track) {
    key = this.createKey(key, EntityType.Track)

    await this.client?.set(key, JSON.stringify(track))
    await this.client?.expire(key, config.expiration.tracks)
  }

  public async setTrackFeatures (key: string, features: TrackFeatures) {
    await this.client?.hSet(key + ':features', stringifyObject(features))
    await this.client?.expire(key + ':features', config.expiration.tracks)
  }

  public async getManyObjects (keys: string[], entityType: EntityType) {
    return this.client?.mGet(
      keys.map(k => this.createKey(k, entityType))
    ).then(list => list.slice(1))
  }

  public async getTrack (hash: string): Promise<TrackWithImageResources | null> {
    hash = this.createKey(hash, EntityType.Track)
    const track = await this.client?.get(hash)
    await this.checkIfIsNull(hash, EntityType.Track)
    return track && typeof track === 'string' && track !== '' ? JSON.parse(track) as unknown as TrackWithImageResources : null
  }

  public async getTrackFeatures (hash: string): Promise<TrackFeatures | null> {
    const features = await this.client?.hGetAll(hash + ':features')
    if (Object.keys(features || {}).length === 0) await this.checkIfIsNull(hash)
    return features && Object.keys(features).length > 0 ? this.convertNulls(features) as unknown as TrackFeatures : null
  }

  public async getAlbum (hash: string): Promise<AlbumWithImageResources | null> {
    hash = this.createKey(hash, EntityType.Album)
    const album = await this.client?.get(hash)
    await this.checkIfIsNull(hash, EntityType.Album)
    return album && typeof album === 'string' && album !== '' ? JSON.parse(album) as unknown as AlbumWithImageResources : null
  }

  public async getArtist (hash: string): Promise<ArtistWithImageResources | null> {
    hash = this.createKey(hash, EntityType.Artist)
    const artist = await this.client?.get(hash)
    await this.checkIfIsNull(hash, EntityType.Artist)
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

  public async checkIfIsNull (hash: string, entityType?: EntityType, source?: DataSource): Promise<void> {
    // const s = performance.now()
    hash = entityType ? this.createKey(hash, entityType) : hash
    const exists = await this.client?.get(this.createNotFoundKey(hash, source || '_'))
    // this.logger.debug('Exists for %s run for %dms', hash, performance.now() - s)
    if (exists === 'true') throw new NotFoundError()
  }

  public checkIfIsNotFound (hash: string, source: DataSource, entityType?: EntityType): Promise<boolean> {
    return new Promise(resolve => {
      this.checkIfIsNull(hash, entityType, source)
        .then(() => resolve(false))
        .catch(() => resolve(true))
    })
  }

  public async setAsNotFound (hash: string, source: DataSource) {
    await this.client?.set(this.createNotFoundKey(hash, source), 'true')
    await this.client?.expire(hash, config.expiration.notFound)
  }

  public createNotFoundKey (key: string, source: string): string {
    return `${source}:${key}::nf`
  }

  public createKey (hash: string, entityType: EntityType) {
    return `${entityPrefix[entityType]}:${hash}`
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
