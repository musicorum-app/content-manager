import {Tedis} from 'tedis'
import {parse} from "dotenv";

class RedisClient {
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

  async setTrack(key, artist) {
    await this.client.hmset(key, {
      ...artist,
      duration: artist.duration.toString(),
      preview: artist.preview || 'null'
    })
    await this.client.expire(key, this.config.expiration.tracks)
  }

  async getTrack(hash) {
    const track = await this.client.hgetall(hash)
    return {
      ...track,
      duration: parseInt(track.duration),
      preview: track.preview && track.preview !== 'null' ? track.preview : null
    }
  }
}

export default RedisClient