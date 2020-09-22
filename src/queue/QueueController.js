import chalk from "chalk";
import QueueSource from "./QueueSource";
import crypto from 'crypto'

class QueueController {
  constructor({logger, config}) {
    this.logger = logger
    this.config = config
    this.queue = {}
    this.runningQueue = {}
    this.init()
  }

  init() {
    const sources = Object.values(QueueSource)
    for (let source of sources) {
      this.queue[source] = new Map()
      this.runningQueue[source] = new Map()
    }

    setInterval(this.tick.bind(this), 1000)
  }

  getRandomId () {
    return crypto.randomBytes(32).toString('hex').toUpperCase()
  }

  tick() {
    // this.logger.silly('TICK')
    Object.values(QueueSource)
      .forEach(source => {
        const tps = this.config.sources[source]
        const queue = this.queue[source]
        const running = this.runningQueue[source]
        const ableToDo = tps - running.size

        if (queue.size > 0) {
          this.logger.silly('Actual queue size: ' + chalk.cyan(running.size + '/' + queue.size)
          + chalk.yellow(' ' + source))
        }

        if (queue.size <= ableToDo) {
          queue.forEach((i, k) => {
            running.set(k, i)
            this.run(k, source, i)
          })
          queue.clear()
        } else {
          const iterator = queue.entries()
          const reqs = []
          for (let i = 0; i < ableToDo; i++) {
            reqs.push(iterator.next().value)
          }
          reqs.forEach(([k, v]) => {
            this.run(k, source, v)
            queue.delete(k)
          })
        }
      })
  }

  async run(id, source, {task, resolve, reject}) {
    this.logger.silly('Running task ' + chalk.cyan(`${id} - ${source}`))
    task()
      .then(r => {
        this.logger.silly('Task done!')
        resolve(r)
        this.runningQueue[source].delete(id)
      })
      .catch(e => {
        reject(e)
        this.runningQueue[source].delete(id)
      })
  }

  async queueTask(source, task) {
    return new Promise((resolve, reject) => {
      this.queue[source].set(this.getRandomId(), {
        task,
        resolve,
        reject
      })
    })
  }

}

export default QueueController