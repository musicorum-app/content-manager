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

  class SpotifyClient {
    constructor(params: SpotifyClientConstructor)

    request(url: string): Promise<any>
    search(params: SpotifySearchParameters): Promise<any>
  }

  export = SpotifyClient
}
