export function chunkArray(arr, size) {
  return arr.reduce((resultArray, item, index) => {
    const chunkIndex = Math.floor(index / size)

    if (!resultArray[chunkIndex]) resultArray[chunkIndex] = []

    resultArray[chunkIndex].push(item)

    return resultArray
  }, [])
}

export function flatArray(arr) {
  return arr.reduce((flat, toFlatten) => {
    return flat.concat(Array.isArray(toFlatten) ? flatArray(toFlatten) : toFlatten);
  }, []);
}

export function stringifyObject(obj) {
  const clone = {}
  for (let key of Object.keys(obj)) {
    clone[key] = obj[key].toString()
  }
  return clone
}

export function numberfyObject(obj) {
  const clone = {}
  for (let key of Object.keys(obj)) {
    clone[key] = parseFloat(obj[key])
  }
  return clone
}