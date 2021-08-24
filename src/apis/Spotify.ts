import SpotifyClient from 'node-spotify-api'

const API_URL = 'https://api.spotify.com/v1'

class SpotifyAPI {
  public client: SpotifyClient

  constructor () {
    if (!process.env.SPOTIFY_ID || !process.env.SPOTIFY_SECRET) {
      throw new Error('Spotify client id and secret are required')
    }
    this.client = new SpotifyClient({
      id: process.env.SPOTIFY_ID || '',
      secret: process.env.SPOTIFY_SECRET || ''
    })
  }

  async searchArtist (query: string, limit = 1): Promise<SpotifySearchResponse> {
    return this.client.search({
      type: 'artist',
      query: `"${query}"`,
      limit
    })
  }

  async searchAlbum (album: string, artist: string, limit = 1): Promise<SpotifySearchResponse> {
    return this.client.search({
      type: 'album',
      query: `"${album}" artist:"${artist}"`,
      limit
    })
      .then(r => ({ ...r, releaseDate: r.release_date }))
  }

  async searchTrack (query: string, limit = 1): Promise<SpotifySearchResponse> {
    return this.client.search({
      type: 'track',
      limit,
      query
    })
      .then(r => ({ ...r, previewUrl: r.preview_url }))
  }

  async getArtists (ids: string[]): Promise<SpotifyMultipleArtistsResponse> {
    return this.client.request(`${API_URL}/artists?ids=${ids.join(',')}`)
  }

  async getAudioFeatures (ids: string[]): Promise<SpotifyAudioFeatures[]> {
    return this.client.request(API_URL + '/audio-features?ids=' + ids.join(','))
      .then(r => r.audio_features)
      .then(r => r.map((a: Record<string, unknown>) => ({ ...a, durationMs: a.duration_ms })))
  }
}

export default SpotifyAPI
