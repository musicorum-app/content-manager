import { IncomingMessage } from 'http'
import SpotifyClient from 'node-spotify-api'
import { Signale } from 'signale'

const API_URL = 'https://api.spotify.com/v1'

const logger = new Signale({ scope: 'SpotifyAPI' })

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

  private async request<T> (fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn()
      return result
    } catch (err) {
      // TODO: fix types of this error
      const error = err as any
      if (error.error.error.status === 429) {
        const response = error.response as IncomingMessage
        logger.warn('Spotify API rate limit exceeded. Retrying after %s seconds', response.headers['retry-after'])
        await new Promise(resolve => setTimeout(resolve, parseInt(response.headers['retry-after'] ?? '1000')))
        return this.request(fn)
      }
      throw err
    }
  }

  async searchArtist (query: string, limit = 25): Promise<SpotifySearchResponse> {
    return this.request(() => this.client.search({
      type: 'artist',
      query: `"${query}"`,
      limit
    }))
  }

  async searchAlbum (album: string, artist: string, limit = 15): Promise<SpotifySearchResponse> {
    return this.request(() => this.client.search({
      type: 'album',
      query: `"${album}" artist:"${artist}"`,
      limit
    }))
  }

  async searchTrack (query: string, limit = 15): Promise<SpotifySearchResponse> {
    return this.request(() => this.client.search({
      type: 'track',
      limit,
      query
    }))
  }

  async getArtists (ids: string[]): Promise<SpotifyMultipleArtistsResponse> {
    return this.request(() => this.client.request(`${API_URL}/artists?ids=${ids.join(',')}`))
  }

  async getAudioFeatures (ids: string[]): Promise<SpotifyAudioFeatures[]> {
    return this.request(() => this.client.request(API_URL + '/audio-features?ids=' + ids.join(','))
      .then(r => r.audio_features))
  }
}

export default SpotifyAPI
