import chalk from "chalk";
import QueueSource from "./QueueSource";

class QueueController {
  constructor({logger, config}) {
    this.logger = logger
    this.config = config
    this.sources = new Map()
    this.init()
  }

  init () {
    const sources = Object.values(QueueSource)
    for (let source of sources) {
      this.sources.set(source, new Set())
      this.logger.silly(`Setting up queue source ${chalk.cyan(source)}.`)
    }

    setInterval(this.tick.bind(this), 1000)
  }

  tick () {
    // this.logger.silly('TICK')
    for (let source of this.sources.keys()) {
      const tps = this.config.sources[source]
      const tasks = this.sources.get(source)
      if (tasks.size) console.log(tasks, tps)
      let i = 0
      const toDelete = []
      for (let task of tasks.values()) {
        console.log(i, tps)
        if (i === tps) break
        this.run(task)
        toDelete.push(task)
        i++
      }

      for (let task of toDelete) {
        tasks.delete(task)
      }
    }
  }

  async run ({task, resolve, reject}) {
    try {
      this.logger.silly('Running task...')
      const result = await task()
      this.logger.silly('Task done!')
      resolve(result)
    } catch (e) {
      reject(e)
    }
  }

  async queueTask(source, task) {
    return new Promise((resolve, reject) => {
      const queue = this.sources.get(source)
      queue.add({
        task,
        resolve,
        reject
      })
    })
  }

}

export default QueueController