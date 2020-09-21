import { Tedis } from 'tedis'

class RedisClient {
  constructor({ logger, config }) {
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
}

export default RedisClient