/* eslint-disable @typescript-eslint/no-unused-vars */
// Deezer

interface DeezerTrack {
  id: number
  title: string
  duration: number
  link: string
  preview: string
  md5_image: string
  artist: {
    id: number
    name: string
  }
}

interface DeezerTrackSearch {
  data: DeezerTrack[]
}

// Spotify

interface SpotifyImages {
  height: number
  width: number
  url: string
}

interface SpotifyArtist {
  id: string
  name: string
  popularity: number
  genres: string[]
  images: SpotifyImages[]
}

interface SpotifyAlbum {
  id: string
  name: string
  release_date?: string
  artists: {
    id: string
    name: string
  }[]
  images: SpotifyImages[]
}

interface SpotifyTrack {
  id: string
  name: string
  popularity: number
  preview_url?: string,
  duration_ms: number,
  album: SpotifyAlbum
  artists: {
    id: string
    name: string
  }[]
}

interface SpotifySearchResponse {
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

interface SpotifyMultipleArtistsResponse {
  artists: SpotifyArtist[]
}

interface SpotifyAudioFeatures {
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
}
