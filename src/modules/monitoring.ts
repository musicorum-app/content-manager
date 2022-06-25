import prom from 'prom-client'
import { DataSource } from '../typings/common'

const register = prom.register

prom.collectDefaultMetrics({
  register
})

const metrics = {
  findersCounter: new prom.Counter({
    name: 'finders_counter',
    help: 'Finders counter (requests/group of resources)',
    labelNames: ['type']
  }), // ok
  resourcesCounter: new prom.Counter({
    name: 'resources_counter',
    help: 'Resources counter (resources count)',
    labelNames: ['type', 'level']
  }), // ok
  requestHistogram: new prom.Histogram({
    name: 'request_histogram',
    help: 'Histogram of request duration',
    buckets: [1, 10, 20, 50, 100, 200, 300, 500, 800, 1E3, 1500, 2E3, 3E3, 4E3, 5E3, 6E3, 8E3, 10E3],
    labelNames: ['endpoint']
  }), // ok
  resourcesHistogram: new prom.Histogram({
    name: 'resources_histogram',
    help: 'Histogram of individual resources duration',
    buckets: [1, 10, 20, 50, 100, 200, 500, 800, 1E3, 1500, 2E3],
    labelNames: ['type', 'level']
  }), // ok

  tasksCounter: new prom.Counter({
    name: 'tasks_counter',
    help: 'Tasks counter from the queue',
    labelNames: ['source']
  }), // ok
  tasksHistogram: new prom.Histogram({
    name: 'tasks_histogram',
    help: 'Histogram of tasks duration',
    buckets: [1, 10, 20, 50, 100, 200, 500, 800, 1E3, 1500, 2E3],
    labelNames: ['source']
  }), // ok

  externalRequests: new prom.Counter({
    name: 'external_requests',
    help: 'External api requests',
    labelNames: ['source', 'method']
  }), // ok
  externalRequestsHistogram: new prom.Histogram({
    name: 'external_requests_histogram',
    help: 'Histogram of external requests duration',
    buckets: [1, 10, 20, 50, 100, 200, 500, 800, 1E3, 1500, 2E3],
    labelNames: ['source', 'method']
  }) // ok
}

function startResourcesTimer (type: 'albums' | 'tracks' | 'artists') {
  const endTimer = metrics.resourcesHistogram.startTimer()

  return (level: number) => {
    const labels = { type, level }
    endTimer(labels)
    metrics.resourcesCounter.labels(labels).inc()
  }
}

function startExternalRequestTimer (source: DataSource, method: string) {
  const endTimer = metrics.externalRequestsHistogram
    .labels({ method, source }).startTimer()

  return () => {
    endTimer()
    metrics.externalRequests.labels({ method, source }).inc()
  }
}

export type Metrics = {
  register: prom.Registry,
  metrics: typeof metrics,
  startResourcesTimer: typeof startResourcesTimer,
  startExternalRequestTimer: typeof startExternalRequestTimer
}

export default {
  metrics,
  register,
  startResourcesTimer,
  startExternalRequestTimer
}
