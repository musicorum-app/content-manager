import { blue, blueBright, magentaBright, red, redBright } from 'colorette'
import crypto from 'crypto'
import { nanoid } from 'nanoid'
import { performance } from 'perf_hooks'
import { Signale } from 'signale'
import config from '../../config.json'
import { Task, TaskRunnable } from '../typings/queue'
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
          this.logger.debug(`Actual queue size is ${redBright('%d/%d')} for ${redBright('%s')}`, running.size, queue.size, source)
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

  public async run<R> (id: string, source: QueueSource, { runnable, resolve, reject }: Task<R>) {
    const start = performance.now()
    runnable()
      .then(result => {
        resolve(result)
      })
      .catch(e => {
        reject(e)
      })
      .finally(() => {
        this.logger.await(`Task ${blue('%s')} [${magentaBright('%s')}] took ${magentaBright('%dms')}`, id, source, (performance.now() - start).toFixed(2))
        this.runningQueue.get(source)?.delete(id)
      })
  }

  public async queueTask<T = any> (source: QueueSource, runnable: TaskRunnable<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = {
        runnable,
        resolve: (r) => resolve(r),
        reject
      } as Task<T>
      this.queue.get(source)?.set(this.createRandomId(), task)

      if (this.runningQueue.size === 0 && this.queue.size === 0) {
        this.tick()
      }
    })
  }

  private createRandomId (): string {
    return nanoid(32)
  }
}
