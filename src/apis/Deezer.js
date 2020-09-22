import fetch from 'node-fetch'

const API_URL = 'https://api.deezer.com/'

class DeezerAPI {
  static searchTrack(track, artist, album) {
    album = album ? ` album:"${album}"` : ''
    const q = `track:"${track}" artist:"${artist}"${album}`
    return this.request('search/track', {
      q
    })
  }

  static getTrack(id) {
    return this.request(`track/${id}`)
  }

  static request(endpoint, params = {}) {
    const query = new URLSearchParams(params)
    return fetch(`${API_URL}${endpoint}?${query.toString()}`)
      .then(r => r.json())
  }
}

export default DeezerAPI