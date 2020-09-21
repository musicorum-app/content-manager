import Hashing from "../utils/hashing";
import QueueSource from "../queue/QueueSource";

const findTrack = async (
  {
    spotifyApi,
    logger,
    redis,
    database,
    queueController
  }, {name, artist, album}) => {
  try {
    const hash = Hashing.hashTrack(name, artist, album)

    const exists = await redis.client.exists(hash)
    if (exists) {
      return redis.getTrack(hash)
    } else {
      const found = await database.findTrack(hash)

      if (found) {
        delete found.cachedAt
        redis.setTrack(hash, found)
        return found
      } else {
        const res = await queueController.queueTask(QueueSource.SPOTIFY, async () => {
          logger.silly('Task run for track ' + name)
          const albumAdc = album ? ` album:${album}` : ''
          return spotifyApi.searchTrack(`"${name}" artist:${artist}${albumAdc}`)
        })

        console.log(res)
        const obj = res.tracks.items[0]
        if (!obj) return null

        const item = {
          hash,
          name: obj.name,
          artist: obj.artists[0].name,
          album: obj.album.name,
          cover: obj.album.images[0].url,
          spotify: obj.id,
          duration: obj.duration_ms,
          preview: obj.preview_url
        }

        redis.setTrack(hash, item)
        database.insertTrack(item)
        return item
      }
    }
  } catch (e) {
    console.error(e)
    logger.error(e.toString())
    return null
  }
}

export default findTrack