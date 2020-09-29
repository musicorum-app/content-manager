import {Tedis} from 'tedis';

export default class RedisClient {
  constructor({logger, config}) {
    this.config = config
    this.logger = logger
    this.client = new Tedis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASS
    })
  }

  async setArtist(key, artist) {
    await this.client.hmset(key, artist)
    await this.client.expire(key, this.config.expiration.artists)
  }

  async setAlbum(key, album) {
    await this.client.hmset(key, album)
    await this.client.expire(key, this.config.expiration.albums)
  }

  async setTrack(key, track) {
    await this.client.hmset(key, {
      ...track,
      duration: track.duration ? track.duration.toString() : '0',
      preview: track.preview || 'null',
      deezer: track.deezer || 'null'
    })
    await this.client.expire(key, this.config.expiration.tracks)
  }

  async getTrack(hash) {
    const track = await this.client.hgetall(hash)
    return {
      ...track,
      duration: parseInt(track.duration),
      preview: track.preview && track.preview !== 'null' ? track.preview : null,
      deezer: track.deezer && track.deezer !== 'null' ? track.deezer : null
    }
  }
}

// export default RedisClient