import Hashing from "../utils/hashing";
import QueueSource from "../queue/QueueSource";

const findAlbum = async (
  {
    spotifyApi,
    logger,
    redis,
    database,
    queueController
  }, {name, artist}) => {
  try {
    const hash = Hashing.hashAlbum(name, artist)

    const exists = await redis.client.exists(hash)
    if (exists) {
      return redis.client.hgetall(hash)
    } else {
      const found = await database.findAlbum(hash)

      if (found) {
        delete found.cachedAt
        redis.setAlbum(hash, found)
        return found
      } else {
        const res = await queueController.queueTask(QueueSource.SPOTIFY, async () => {
          logger.silly('Task run ' + name)
          return spotifyApi.searchAlbum(name, artist)
        })

        if (res.albums.items.length === 0) return null


        const obj = res.albums.items[0]
        const item = {
          hash,
          name: obj.name,
          spotify: obj.id,
          cover: obj.images[0].url
        }

        redis.setAlbum(hash, item)
        database.insertAlbum(item)
        return item
      }
    }
  } catch (e) {
    console.error(e)
    logger.error(e.toString())
    return null
  }
}

export default findAlbum