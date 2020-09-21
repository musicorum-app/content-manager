import fetch from 'node-fetch'

const API_URL = 'https://api.spotify.com/v1/'
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'

class SpotifyAPI {
  constructor() {
    this.token = null
    this.getToken()
  }

  async searchArtist(query, limit = 1) {
    return this.request('search', {
      type: 'artist',
      q: `"${query}"`,
      limit
    })
  }

  async getArtists(ids) {
    console.log(`artists?ids=${ids.join(',')}`, this.token.accessToken)
    return this.request('artists', {
      ids: ids.join(',')
    })
  }

  async request(path, params = {}) {
    if (this.isTokenExpired) await this.getToken()

    const query = new URLSearchParams(params)
    return fetch(`${API_URL}${path}?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.token.accessToken}`
      }
    })
      .then(res => res.json())
  }

  async getToken() {
    const {
      access_token,
      expires_in
    } = await fetch(`${TOKEN_ENDPOINT}?grant_type=client_credentials`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }).then(res => res.json())

    this.token = {
      accessToken: access_token,
      expiresAt: new Date(new Date().getTime() + (expires_in * 1000))
    }
  }

  get authHeader() {
    return 'Basic ' + Buffer.from(process.env.SPOTIFY_ID + ':' + process.env.SPOTIFY_SECRET)
      .toString('base64')
  }

  get isTokenExpired() {
    return this.token ? this.token.expiresAt - new Date() <= 0 : true
  }
}

export default SpotifyAPI