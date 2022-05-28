import { Image, ImageResource, PrismaClient } from '@prisma/client'
import Vibrant from 'node-vibrant'

function imageAreaSize (image: Image): number {
  return (image.width || 0) * (image.height || 0)
}

export async function retrieveColorPalette (prisma: PrismaClient, resource: (
  ImageResource & { images: Image[] }
)) {
  const lowestImage = resource.images.reduce((p, c) => imageAreaSize(p) < imageAreaSize(c) ? p : c)
  const colors = await Vibrant.from(lowestImage.url).getPalette()
  const data = {
    palette_vibrant: colors.Vibrant?.hex ?? null,
    palette_dark_vibrant: colors.DarkVibrant?.hex ?? null,
    palette_light_vibrant: colors.LightVibrant?.hex ?? null,
    palette_muted: colors.Muted?.hex ?? null,
    palette_dark_muted: colors.DarkMuted?.hex ?? null,
    palette_light_muted: colors.LightMuted?.hex ?? null
  }

  await prisma.imageResource.update({
    where: {
      hash: resource.hash
    },
    data
  })
  return data
}
