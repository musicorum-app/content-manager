import {createHash} from 'crypto'

class Hashing {
  static hash(str) {
    const sha = createHash('sha1')
    sha.update(str)
    return sha.digest("hex")
  }

  static normalizeString(str) {
    return str
      .toLowerCase()
      .replace(/ +/g, '')
  }

  static hashArtist(artist) {
    return this.hash(
      this.normalizeString(artist)
    )
  }

  static hashTrack(name, artist, album) {
    return this.hash(
      this.normalizeString(`${name}:${artist}:${album}`)
    )
  }

  static hashAlbum(name, artist) {
    return this.hash(
      this.normalizeString(`${name}:${artist}`)
    )
  }
}

export default Hashing