import prom from 'prom-client'

const register = prom.register

prom.collectDefaultMetrics({
  register
})

const metrics = {
  findersCounter: new prom.Counter({
    name: 'finders_counter',
    help: 'Finders counter (requests/group of resources)',
    labelNames: ['type']
  }),
  resourcesCounter: new prom.Counter({
    name: 'resources_counter',
    help: 'Resources counter (resources count)',
    labelNames: ['type']
  })
}

export type Metrics = {
  register: prom.Registry,
  metrics: typeof metrics
}

export default {
  metrics,
  register
}
