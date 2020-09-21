import fetch from 'node-fetch'
import SpotifyClient from 'node-spotify-api'

const API_URL = 'https://api.spotify.com/v1/'
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'

class SpotifyAPI {
  constructor() {
    this.client = new SpotifyClient({
      id: process.env.SPOTIFY_ID,
      secret: process.env.SPOTIFY_SECRET
    })
  }

  async searchArtist(query, limit = 1) {
    return this.client.search({
      type: 'artist',
      query: `"${query}"`,
      limit
    })
  }

  async searchTrack(query, limit = 1) {
    return this.client.search({
      type: 'track',
      limit,
      query
    })
  }

  async getArtists(ids) {
    return this.client.request(`${API_URL}?q=${ids.join(',')}`)
  }
}

export default SpotifyAPI