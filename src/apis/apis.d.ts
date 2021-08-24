// Deezer

type DeezerTrack = {
  id: number
  title: string
  duration: number
  link: string
  preview: string
  md5Image: string
  artist: {
    id: number
    name: string
  }
}

type DeezerTrackSearch = {
  data: DeezerTrack[]
}

// Spotify

declare module 'node-spotify-api' {

  type SpotifyClientConstructor = {
    id: string,
    secret: string
  }

  type SpotifySearchParameters = {
    type: string,
    limit: number,
    query: string
  }

  declare class SpotifyClient {
    constructor(params: SpotifyClientConstructor)

    request(url: string): Promise<any>
    search(params: SpotifySearchParameters): Promise<any>
  }

  export = SpotifyClient
}

type SpotifyImages = {
  height: number
  width: number
  url: string
}

type SpotifyArtist = {
  id: string
  name: string
  popularity: number
  genres: string[]
  images: SpotifyImages[]
}

type SpotifyAlbum = {
  id: string
  name: string
  release_date?: string
  artists: {
    id: string
    name: string
  }[]
  images: SpotifyImage[]
}

type SpotifyTrack = {
  id: string
  name: string
  popularity: number
  previewUrl?: string
  album: SpotifyAlbum
  artists: {
    id: string
    name: string
  }[]
}

type SpotifySearchResponse = {
  artists?: {
    items: SpotifyArtist[]
  }
  albums?: {
    items: SpotifyAlbum[]
  }
  tracks?: {
    items: SpotifyTrack[]
  }
}

type SpotifyMultipleArtistsResponse = {
  artists: SpotifyArtist[]
}

type SpotifyAudioFeatures = {
  danceability: number
  energy: number
  key: number
  loudness: number
  mode: number
  speechiness: number
  acousticness: number
  instrumentalness: number
  liveness: number
  valence: number
  tempo: number
  durationMs: number
}
