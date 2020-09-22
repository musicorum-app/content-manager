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
            deezer: 1,
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

  findAlbum(hash) {
    try {
      return this.database
        .collection('albums')
        .findOne({hash}, {
          projection: {
            _id: 0,
            name: 1,
            spotify: 1,
            cover: 1
          }
        })
    } catch (e) {
      this.logger.error(e)
      return null
    }
  }

  getTrackFeatures(id) {
    try {
      return this.database
        .collection('trackFeatures')
        .findOne({_id: id})
    } catch (e) {
      this.logger.error(e)
      return null
    }
  }

  modifyTrack(hash, update) {
    return this.database
      .collection('tracks')
      .findOneAndUpdate(
        {hash},
        {
          $set: update
        }
      )
  }

  insertArtist(artist) {
    return this.database
      .collection('artists')
      .insertOne({
        ...artist,
        cachedAt: new Date().getTime()
      })
  }

  insertAlbum(album) {
    return this.database
      .collection('albums')
      .insertOne({
        ...album,
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

  insertTrackFeatures(id, data) {
    try {
      return this.database
        .collection('trackFeatures')
        .insertOne({
          _id: id,
          ...data
        })
    } catch (e) {
      this.logger.error(e)
      return null
    }
  }
}

export default DatabaseClient