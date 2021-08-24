export function chunkArray (arr: any[], size: number): any[][] {
  return arr.reduce((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / size)

    if (!resultArray[chunkIndex]) resultArray[chunkIndex] = []

    resultArray[chunkIndex].push(item)

    return resultArray
  }, [])
}

export function flatArray (arr: any[]): any[] {
  return arr.reduce((flat, toFlatten) => {
    return flat.concat(Array.isArray(toFlatten) ? flatArray(toFlatten) : toFlatten)
  }, [])
}

export function stringifyObject<T extends Record<string, any>> (obj: T): Record<keyof T, string> {
  const clone: Record<string, string> = {}

  for (const key of Object.keys(obj)) {
    clone[key] = obj[key].toString()
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
