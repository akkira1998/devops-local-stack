const promClient = require('prom-client');

promClient.collectDefaultMetrics();

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]  // диапазоны
});

const activeRequests = new promClient.Gauge({
  name: 'http_requests_active',
  help: 'Number of active HTTP requests'
});

const dbQueryDuration = new promClient.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['query_type', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1]
});

const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['key_type']
});

const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['key_type']
});

const applicationErrors = new promClient.Counter({
  name: 'application_errors_total',
  help: 'Total application errors',
  labelNames: ['error_type']
});

const usersCreated = new promClient.Counter({
  name: 'users_created_total',
  help: 'Total users created'
});

module.exports = {
  httpRequestDuration,
  activeRequests,
  dbQueryDuration,
  cacheHits,
  cacheMisses,
  applicationErrors,
  usersCreated,
  getMetrics: () => promClient.register.metrics()
};
EOF