import { Tedis } from 'tedis'
import { Signale } from 'signale'
import config from '../../config.json'
import { Album, Artist, Track } from '@prisma/client'
import { stringifyObject } from '../utils/utils'

const notFoundValue = '␀'

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

  public async setArtist (key: string, artist: Artist) {
    await this.client?.hmset(key, stringifyObject(artist))
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

  public async getTrack (hash: string): Promise<Track | null> {
    await this.checkIfIsNull(hash)
    const track = await this.client?.hgetall(hash)
    return track ? track as unknown as Track : null
  }

  public async getAlbum (hash: string): Promise<Album | null> {
    await this.checkIfIsNull(hash)
    const album = await this.client?.hgetall(hash)
    return album ? album as unknown as Album : null
  }

  public async getArtist (hash: string): Promise<Artist | null> {
    await this.checkIfIsNull(hash)
    const artist = await this.client?.hgetall(hash)
    return artist ? artist as unknown as Artist : null
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
    const type = await this.client?.type(hash)
    if (!type || type === 'none') return

    if (type === 'string' && (await this.client?.get(hash)) === notFoundValue) throw new NotFoundError()
  }

  public async setAsNotFound (hash: string) {
    await this.client?.set(hash, notFoundValue)
    await this.client?.expire(hash, config.expiration.notFound)
  }
}

export class NotFoundError extends Error {
  constructor () {
    super('NotFoundError')
    this.name = 'NotFoundError'
  }
}
