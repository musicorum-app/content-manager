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

  findArtist(hash) {
    try {
      return this.database
        .collection('artists')
        .findOne({hash}, {
          projection: {
            _id: 0,
            name: 1,
            hash: 1,
            spotify: 1,
            image: 1,
            cachedAt: 1
          }
        })
    } catch (e) {
      this.logger.error(e)
      return null
    }
  }

  findTrack(hash) {
    try {
      return this.database
        .collection('tracks')
        .findOne({hash}, {
          projection: {
            _id: 0,
            name: 1,
            artist: 1,
            album: 1,
            hash: 1,
            spotify: 1,
            cover: 1,
            duration: 1,
            cachedAt: 1,
            preview: 1
          }
        })
    } catch (e) {
      this.logger.error(e)
      return null
    }
  }

  insertArtist(artist) {
    return this.database
      .collection('artists')
      .insertOne({
        ...artist,
        cachedAt: new Date().getTime()
      })
  }

  insertTrack(track) {
    return this.database
      .collection('tracks')
      .insertOne({
        ...track,
        cachedAt: new Date().getTime()
      })
  }
}

export default DatabaseClient