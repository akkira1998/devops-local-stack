const express = require('express');
const pg = require('pg');
const redis = require('redis');
const amqp = require('amqplib');
const logger = require('./logger');
const metrics = require('./metrics');

require('dotenv').config();

const app = express();
app.use(express.json());

let pgPool;           // пул соединений с БД
let redisClient;      // клиент Redis
let amqpChannel;      // канал RabbitMQ
let isShuttingDown = false;

app.use((req, res, next) => {
  const startTime = Date.now();

  metrics.activeRequests.inc();
  

  res.on('finish', () => {
    metrics.activeRequests.dec();

    const duration = (Date.now() - startTime) / 1000;
    metrics.httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode
      },
      duration
    );
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration.toFixed(3)}s`
    });
  });
  
  next();
});

async function initializeConnections() {
  try {
    // 1. PostgreSQL подключение
    logger.info('Connecting to PostgreSQL...');
    pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
    
    await pgPool.query('SELECT 1');
    logger.info('✅ PostgreSQL connected');
    
    // 2. Redis подключение
    logger.info('Connecting to Redis...');
    redisClient = redis.createClient({
      url: process.env.REDIS_URL
    });
    
    redisClient.on('error', (err) => {
      logger.error('Redis error:', err);
      metrics.applicationErrors.inc({ error_type: 'redis' });
    });
    
    await redisClient.connect();
    logger.info('✅ Redis connected');
    
    // 3. RabbitMQ подключение
    logger.info('Connecting to RabbitMQ...');
    const amqpConnection = await amqp.connect(process.env.RABBITMQ_URL);
    amqpChannel = await amqpConnection.createChannel();
    
    await amqpChannel.assertQueue('tasks', { durable: true });
    await amqpChannel.assertQueue('user.created', { durable: true });
    
    logger.info('✅ RabbitMQ connected');
    
    // 4. Инициализация БД таблиц
    await initializeTables();
    
  } catch (error) {
    logger.error('Failed to initialize connections:', error);
    metrics.applicationErrors.inc({ error_type: 'init' });
    process.exit(1);
  }
}

async function initializeTables() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50),
        user_id INTEGER,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('Database tables initialized');
  } catch (error) {
    logger.error('Failed to initialize tables:', error);
    throw error;
  }
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

app.get('/ready', async (req, res) => {
  try {
    await pgPool.query('SELECT 1');
    await redisClient.ping();
    
    if (!amqpChannel) throw new Error('RabbitMQ not ready');
    
    res.json({ ready: true });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    metrics.applicationErrors.inc({ error_type: 'readiness' });
    res.status(503).json({ ready: false, error: error.message });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', 'text/plain');
    const metricsData = await metrics.getMetrics();
    res.end(metricsData);
  } catch (error) {
    logger.error('Error generating metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const cacheKey = 'users:all';
    
    // 1. Попытка получить из Redis
    const cachedUsers = await redisClient.get(cacheKey);
    if (cachedUsers) {
      metrics.cacheHits.inc({ key_type: 'users' });
      logger.debug('Cache hit: users');
      return res.json(JSON.parse(cachedUsers));
    }
    
    metrics.cacheMisses.inc({ key_type: 'users' });

    const startTime = Date.now();
    const result = await pgPool.query(
      'SELECT id, name, email, created_at FROM users LIMIT 100'
    );
    const duration = (Date.now() - startTime) / 1000;
    metrics.dbQueryDuration.observe(
      { query_type: 'select', table: 'users' },
      duration
    );

    await redisClient.setEx(cacheKey, 300, JSON.stringify(result.rows));
    
    logger.info(`Fetched ${result.rows.length} users from database`);
    res.json(result.rows);
    
  } catch (error) {
    logger.error('Error fetching users:', error);
    metrics.applicationErrors.inc({ error_type: 'api' });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, email } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'name and email required' });
    }

    const startTime = Date.now();
    const result = await pgPool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    const duration = (Date.now() - startTime) / 1000;
    metrics.dbQueryDuration.observe(
      { query_type: 'insert', table: 'users' },
      duration
    );
    
    const newUser = result.rows[0];

    await redisClient.del('users:all');

    const message = JSON.stringify({
      type: 'user.created',
      userId: newUser.id,
      email: newUser.email,
      timestamp: new Date()
    });
    amqpChannel.sendToQueue('user.created', Buffer.from(message), { persistent: true });

    metrics.usersCreated.inc();
    
    logger.info(`User created: ${newUser.id}`);
    res.status(201).json(newUser);
    
  } catch (error) {
    logger.error('Error creating user:', error);
    metrics.applicationErrors.inc({ error_type: 'api_create_user' });
    res.status(500).json({ error: error.message });
  }
});

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    server.close(() => {
      logger.info('HTTP server closed');
    });
    
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
    
    if (pgPool) {
      await pgPool.end();
      logger.info('PostgreSQL connection pool closed');
    }
    
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
    
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============ START SERVER ============

async function start() {
  try {
    await initializeConnections();
    
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server started on port ${PORT}`);
      logger.info(`Health: http://localhost:${PORT}/health`);
      logger.info(`Metrics: http://localhost:${PORT}/metrics`);
    });
    
    global.server = server;
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = app;
