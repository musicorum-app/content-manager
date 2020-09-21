import {MongoClient} from 'mongodb'

class DatabaseClient {
  constructor({logger}) {
    this.logger = logger
    this.client = new MongoClient(process.env.MONGO_URI, {
      useUnifiedTopology: true
    })

    this.client
      .connect()
      .then(() => {
        logger.info('Database connected!')
        this.database = this.client.db('resources')
      })
      .catch(() => logger.error('Database disconnected!'))
  }

  findArtist(hash, showCachedAt = false) {
    return this.database
      .collection('artists')
      .findOne({hash}, {
        projection: {
          _id: 0,
          hash: 1,
          spotify: 1,
          image: 1,
          cachedAt: 1
        }
      })
  }

  insertArtist(artist) {
    return this.database
      .collection('artists')
      .insertOne({
        ...artist,
        cachedAt: new Date().getTime()
      })
  }
}

export default DatabaseClient