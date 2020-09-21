import Hashing from "../utils/hashing";
import QueueSource from "../queue/QueueSource";

const findArtist = async (
  {
    spotifyApi,
    logger,
    redis,
    database,
    queueController
  }, name) => {
  try {
    const hash = Hashing.hashArtist(name)

    const exists = await redis.client.exists(hash)
    if (exists) {
      return redis.client.hgetall(hash)
    } else {
      const found = await database.findArtist(hash)

      if (found) {
        delete found.cachedAt
        redis.setArtist(hash, found)
        return found
      } else {
        const res = await queueController.queueTask(QueueSource.SPOTIFY, async () => {
          logger.silly('Task run ' + name)
          return spotifyApi.searchArtist(name)
        })

        if (res.artists.items.length === 0) return null


        const obj = res.artists.items[0]
        const item = {
          hash,
          name: obj.name,
          spotify: obj.id,
          image: obj.images[0].url
        }

        redis.client.set(`spotify-popularity:${item.spotify}`, obj.popularity)
        redis.setArtist(hash, item)
        database.insertArtist(item)
        return item
      }
    }
  } catch (e) {
    console.error(e)
    logger.error(e.toString())
    return null
  }
}

export default findArtist