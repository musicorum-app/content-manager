import crypto from 'crypto'
import { Signale } from 'signale'
import config from '../../config.json'
import { QueueSource } from './sources'

export default class QueueController {
  private logger: Signale
  private queue: Map<QueueSource, Map<string, Task>>
  private runningQueue: Map<QueueSource, Map<string, Task>>

  constructor () {
    this.logger = new Signale({ scope: 'Queue' })
    this.queue = new Map()
    this.runningQueue = new Map()
  }

  public init () {
    this.logger.info('Starting service')

    const sources = Object.keys(config.sources)
    for (const source of sources) {
      this.logger.info('Source %s started with a TPS of %d.', source, (config as any).sources[source])
      this.queue.set(source as QueueSource, new Map())
      this.runningQueue.set(source as QueueSource, new Map())
    }

    setInterval(this.tick.bind(this), 1000)
  }

  private tick () {
    Object.values(QueueSource)
      .forEach((source: QueueSource) => {
        const tps = config.sources[source]
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const queue = this.queue.get(source)!
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const running = this.runningQueue.get(source)!
        const ableToDo = tps - running.size

        if (queue.size > 0) {
          this.logger.debug('Actual queue size is %d/%d for %s', running.size, queue.size, source)
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

  public async run (id: string, source: QueueSource, { runnable, resolve, reject }: Task) {
    this.logger.time('Task ' + id)
    runnable()
      .then(result => {
        this.logger.timeEnd('Task ' + id)
        resolve(result)
      })
      .catch(e => {
        this.logger.timeEnd('Task ' + id)
        reject(e)
      })
      .finally(() => {
        this.runningQueue.get(source)?.delete(id)
      })
  }

  public async queueTask<T> (source: QueueSource, runnable: TaskRunnable): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.get(source)?.set(this.createRandomId(), {
        runnable,
        resolve,
        reject
      })

      if (this.runningQueue.size === 0 && this.queue.size === 0) {
        this.tick()
      }
    })
  }

  private createRandomId (): string {
    return crypto.randomBytes(32).toString('hex').toUpperCase()
  }
}
