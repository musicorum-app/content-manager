import { ImageResource, PrismaClient } from '@prisma/client'

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
