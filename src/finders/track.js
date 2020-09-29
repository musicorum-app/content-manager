import Hashing from "../utils/hashing";
import QueueSource from "../queue/QueueSource";
import DeezerAPI from "../apis/Deezer";
import chalk from "chalk";

const findTrack = async (
  {
    spotifyApi,
    logger,
    redis,
    database,
    queueController
  }, {name, artist, album}, showPreview, needsDeezer) => {
  try {
    const hash = Hashing.hashTrack(name, artist, album)

    const exists = await redis.client.exists(hash)
    if (exists) {
      const t = await redis.getTrack(hash)
      const track = await resolveTrack({queueController, database}, showPreview, needsDeezer, t)
      redis.setTrack(hash, track)
      return track
    } else {
      const f = await database.findTrack(hash)

      if (f) {
        delete f.cachedAt
        const found = await resolveTrack({queueController, database}, showPreview, needsDeezer, f)
        redis.setTrack(hash, found)
        return found
      } else {
        const res = await queueController.queueTask(QueueSource.SPOTIFY, async () => {
          logger.silly(chalk.cyan('Scheduling track task ' + name))

          const albumAdc = album ? ` album:${album}` : ''
          return spotifyApi.searchTrack(`"${name}" artist:${artist}${albumAdc}`)
        })

        const obj = res.tracks.items[0]
        if (!obj) return null

        let item = {
          hash,
          name: obj.name,
          artist: obj.artists[0].name,
          album: obj.album.name,
          cover: obj.album.images[0].url,
          spotify: obj.id,
          duration: obj.duration_ms,
          preview: obj.preview_url
        }

        item = await resolveTrack({queueController, database}, showPreview, needsDeezer, item)

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

const resolveTrack = async ({queueController, database}, show, deezer, track) => {
  if (!show && !deezer) return track
  if (!track) return null

  let canReturn = true
  if (show && !track.preview) canReturn = false
  if (deezer && !track.deezer) canReturn = false

  if (canReturn) return track

  let p
  if (track.deezer) {
    p = () => DeezerAPI.getTrack(track.deezer)
  } else {
    p = async () => {
      const {data} = await DeezerAPI.searchTrack(track.name, track.artist, track.album)
      return data[0]
    }
  }

  console.log("PREV " + track.preview)

  const res = await queueController.queueTask(QueueSource.DEEZER, p)

  if (!res) return track

  const update = {
    deezer: res.id.toString(),
    preview: track.preview || res.preview
  }

  database.modifyTrack(track.hash, update)

  return {
    ...track,
    ...update
  }
}

export default findTrack