import { createHash } from 'crypto'

export function hash (str: string): string {
  const sha = createHash('sha1')
  sha.update(str)
  return sha.digest('hex')
}

export function normalizeString (str: string): string {
  return str
    .toLowerCase()
    .replace(/ +/g, '')
}

export function hashArtist (artist: string): string {
  return hash(
    normalizeString(artist)
  )
}

export function hashTrack (name: string, artist: string, album: string): string {
  return hash(
    normalizeString(`${name}:${artist}:${album}`)
  )
}

export function hashAlbum (name: string, artist: string): string {
  return hash(
    normalizeString(`${name}:${artist}`)
  )
}
