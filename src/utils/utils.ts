import { ImageSize } from '@prisma/client'
import { DataSource } from '../typings/common'

export function chunkArray<T> (arr: T[], size: number): T[][] {
  return arr.reduce((resultArray: T[][], item, index) => {
    const chunkIndex = Math.floor(index / size)

    if (!resultArray[chunkIndex]) resultArray[chunkIndex] = []

    resultArray[chunkIndex].push(item)

    return resultArray
  }, [])
}

export function flatArray<T> (arr: T[][]): T[] {
  return arr.reduce((acc, value) =>
    acc.concat(value), []
  )
}

export function stringifyObject<T extends Record<string, any>> (obj: T): Record<keyof T, string> {
  const clone: Record<string, string> = {}

  for (const key of Object.keys(obj)) {
    if (obj[key] === null) {
      clone[key] = 'null'
    } else {
      clone[key] = typeof obj[key] === 'object' ? JSON.stringify(obj[key]) : obj[key].toString()
    }
    clone[key] = obj[key] !== null ? obj[key].toString() : 'null'
  }

  return clone as Record<keyof T, string>
}

export function numerifyObject<T extends Record<string, any>> (obj: T): Record<keyof T, number> {
  const clone: Record<string, number> = {}

  for (const key of Object.keys(obj)) {
    clone[key] = parseFloat(obj[key])
  }

  return clone as Record<keyof T, number>
}

export function normalizeString (str: string): string {
  return str.toLowerCase().replace(/\s/g, '')
}

export function formatList (arr: string[]): string {
  return arr
    .map(el => encodeURIComponent(el))
    .join(';')
}

export function formatListBack (str?: string | null): string[] {
  return str && str !== 'null' ? str.split(';').map(el => decodeURIComponent(el)) : []
}

export function valueOrNull<T> (value: T | 'null'): T | null {
  return value === 'null' || value === undefined || value === null ? null : value
}

export function fromListOrArray (value: string | string[]) {
  if (!value) return []
  return Array.isArray(value) ? value : value.split(',')
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function doNothing () { }

export function parseQueryList (qs: unknown) {
  if (Array.isArray(qs)) {
    return qs as string[]
  } else if (typeof qs === 'string') {
    return qs.split(',')
  } else {
    return []
  }
}

export function parseSourcesList (qs: unknown) {
  const list = parseQueryList(qs)

  const availableSources = Object.keys(DataSource).map(s => s.toLowerCase())
  return list
    .filter(s => availableSources.includes(s.toLowerCase()))
    .map(s => s.toLowerCase()) as DataSource[]
}
/**
 *  | EXTRA_SMALL |  SMALL  |  MEDIUM  |   LARGE  | EXTRA_LARGE |
 *  0------------100-------200--------600--------950------------
 */
export function imageSizeToSizeEnum (width: number, height: number): ImageSize {
  const significantSize = width > height ? height : width

  if (significantSize <= 100) return ImageSize.EXTRA_SMALL
  else if (significantSize <= 200) return ImageSize.SMALL
  else if (significantSize <= 600) return ImageSize.MEDIUM
  else if (significantSize <= 950) return ImageSize.LARGE
  else return ImageSize.EXTRA_LARGE
}

export const isLastFMError = (
  error: unknown
): error is { code: number, message: string } => {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error
  )
}
