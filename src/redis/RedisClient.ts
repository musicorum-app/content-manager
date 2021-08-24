import { Tedis } from 'tedis'
import { Signale } from 'signale'
import config from '../../config.json'

export default class RedisClient {
  private logger: Signale
  private client?: Tedis

  constructor () {
    this.logger = new Signale({ scope: 'Redis' })
  }

  async init (): Promise<void> {
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
      })
    })
  }

  async setArtist (key: string, artist: any) {
    await this.client?.hmset(key, artist)
    await this.client?.expire(key, config.expiration.artists)
  }

  async setAlbum (key: string, album: any) {
    await this.client?.hmset(key, album)
    await this.client?.expire(key, config.expiration.albums)
  }

  async setTrack (key: string, track: any) {
    await this.client?.hmset(key, {
      ...track,
      duration: track.duration ? track.duration.toString() : '0',
      preview: track.preview || 'null',
      deezer: track.deezer || 'null'
    })
    await this.client?.expire(key, config.expiration.tracks)
  }

  public async getTrack (hash: string) {
    const track = await this.client?.hgetall(hash)
    return !track ? null : {
      ...track,
      duration: parseInt(track.duration),
      preview: track.preview && track.preview !== 'null' ? track.preview : null,
      deezer: track.deezer && track.deezer !== 'null' ? track.deezer : null
    }
  }
}
