import { hash, hashArtist } from '../utils/hashing'
import { ArtistResponse, Context } from '../typings/common'
import { Artist, Image, ImageResource, ImageResourceSource, PrismaClient } from '@prisma/client'
import { fromListOrArray, normalizeString, valueOrNull } from '../utils/utils'
import { Signale } from 'signale'
import { NotFoundError } from '../redis/RedisClient'
import { QueueSource } from '../queue/sources'

const logger = new Signale({ scope: 'ArtistFinder' })

export type ArtistWithImageResources = Artist & {
  resources: (ImageResource & {
    images: Image[]
  })[]
}

export async function findArtist (
  {
    spotifyApi,
    redis,
    prisma,
    queueController
  }: Context, name: string): Promise<ArtistWithImageResources | null> {
  try {
    const hashedArtist = hashArtist(name)

    const exists = await redis.getArtist(hashedArtist)
    if (exists && exists.hash) {
      return exists
    } else {
      const found = await getArtistFromPrisma(prisma, hashedArtist)
      if (found) {
        redis.setArtist(hashedArtist, found)
        return found
      } else {
        const res = await queueController.queueTask<SpotifySearchResponse>(
          QueueSource.Spotify,
          () => spotifyApi.searchArtist(name)
        )

        if (res.artists?.items.length === 0) {
          redis.setAsNotFound(hashedArtist)
          return null
        }

        let selected = res.artists?.items.find(a => normalizeString(a.name) === normalizeString(name)) as SpotifyArtist

        if (!selected) {
          selected = res.artists?.items[0] as SpotifyArtist
        }

        const item: Artist = {
          hash: hashedArtist,
          name: selected.name,
          spotify_id: selected.id,
          deezer_id: null,
          genres: selected.genres,
          similar: [],
          tags: [],
          created_at: new Date(),
          updated_at: new Date()
        }

        const hasImage = selected.images && selected.images.length > 0 && selected.images[0].url

        await prisma.artist.create({
          data: hasImage ? {
            ...item,
            resources: {
              create: {
                hash: hash(selected.images.map(i => i.url).join('') + hashedArtist),
                source: ImageResourceSource.SPOTIFY,
                images: {
                  createMany: {
                    data: selected.images.map(image => ({
                      hash: hash(image.url + hashedArtist),
                      url: image.url,
                      width: image.width,
                      height: image.height
                    }))
                  }
                }
              }
            }
          } : item
        })

        const entry = await getArtistFromPrisma(prisma, hashedArtist)
        if (!entry) throw new Error('This artist could not be saved.')

        redis.setArtist(hashedArtist, entry)
        redis.setPopularity(selected.id, selected.popularity)

        return entry
      }
    }
  } catch (e) {
    if (e instanceof NotFoundError) {
      return null
    }
    logger.error(e)
    return null
  }
}

function getArtistFromPrisma (prisma: PrismaClient, hash: string) {
  return prisma.artist.findUnique({
    where: {
      hash
    },
    include: {
      resources: {
        include: {
          images: true
        }
      }
    }
  })
}

export function formatDisplayArtist ({
  hash,
  name,
  spotify_id,
  deezer_id,
  genres,
  similar,
  resources,
  tags,
  created_at
}: ArtistWithImageResources): ArtistResponse {
  return {
    hash,
    name,
    spotify_id: valueOrNull(spotify_id),
    deezer_id: valueOrNull(deezer_id ? Number(deezer_id) : null),
    resources: resources.map(resource => ({
      hash: resource.hash,
      explicit: resource.explicit,
      source: resource.source,
      color_palette: {
        vibrant: resource.palette_vibrant,
        dark_vibrant: resource.palette_dark_vibrant,
        light_vibrant: resource.palette_light_vibrant,
        muted: resource.palette_muted,
        dark_muted: resource.palette_dark_muted,
        light_muted: resource.palette_light_muted
      },
      active: resource.active,
      // convert to date because of redis data is a JSON
      created_at: new Date(resource.created_at).getTime().toString(),
      images: resource.images.map(image => ({
        hash: image.hash,
        url: image.url,
        width: image.width,
        height: image.height
      }))
    })),
    genres: fromListOrArray(genres),
    similar: fromListOrArray(similar),
    tags: fromListOrArray(tags),
    popularity: null,
    created_at: new Date(created_at).getTime().toString()
  }
}
