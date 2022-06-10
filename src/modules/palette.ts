import { Image, ImageResource, ImageSize, PrismaClient } from '@prisma/client'
import Vibrant from 'node-vibrant'
import { Signale } from 'signale'
import { Context } from 'vm'
import { QueueSource } from '../queue/sources'

const logger = new Signale({ scope: 'PaletteModule' })

function getImageBySize (images: Image[], size: ImageSize) {
  return images.find(image => image.size === size)
}
// @todo: use another library because Vibrant uses Jimp as backend
export async function retrieveColorPalette (prisma: PrismaClient, resource: (
  ImageResource & { images: Image[] }
)) {
  const lowestImage = getImageBySize(resource.images, ImageSize.SMALL) ||
      getImageBySize(resource.images, ImageSize.MEDIUM) ||
      resource.images[0]
  try {
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
  } catch (err) {
    logger.error(`Problem while parsing palette of ${lowestImage.url}`, err)
  }
}

type ContentImageResource = {
  image_resource: ImageResource & { images: Image[] }
}

export async function resolveResourcePalette (ctx: Context, resources: ContentImageResource[]) {
  if (!resources) return
  let changed = false

  for (const imageResource of resources) {
    const resource = imageResource.image_resource
    if (!resource.palette_vibrant && resource.images.length > 0) {
      const palette = await ctx.queueController.queueTask(
        QueueSource.PaletteResolver,
        () => retrieveColorPalette(ctx.prisma, resource)
      )
      imageResource.image_resource = {
        ...resource,
        ...palette
      }
      changed = true
    }
  }

  return changed
}
