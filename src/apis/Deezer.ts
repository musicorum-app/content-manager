import fetch from 'node-fetch'

const API_URL = 'https://api.deezer.com/'

class DeezerAPI {
  static searchTrack (track: string, artist: string, album: string): Promise<DeezerTrackSearch> {
    album = album ? ` album:"${album}"` : ''
    const q = `track:"${track}" artist:"${artist}"${album}`
    return this.request('search/track', {
      q
    })
      .then(r => ({ ...r, md5Image: r.md5_image }))
  }

  static getTrack (id: string): Promise<DeezerTrack> {
    return this.request(`track/${id}`)
      .then(r => ({ ...r, md5Image: r.md5_image }))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static request (endpoint: string, params = {}): Promise<any> {
    const query = new URLSearchParams(params)
    return fetch(`${API_URL}${endpoint}?${query.toString()}`)
      .then(r => r.json())
  }
}

export default DeezerAPI
