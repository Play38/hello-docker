const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const app = express();

app.use(cors());
app.use(express.json());

// --- Redis Client (Sentinel Mode) ---
const redisClient = new Redis({
  sentinels: [
    { host: 'redis-sentinel1', port: 26379 },
    { host: 'redis-sentinel2', port: 26379 },
    { host: 'redis-sentinel3', port: 26379 },
  ],
  name: 'mymaster',
  password: process.env.REDIS_PASSWORD,
  sentinelPassword: process.env.REDIS_PASSWORD,
});

redisClient.on('connect', () => console.log('Connected to Redis'));
redisClient.on('error', (err) => console.error('Redis error:', err));

// --- MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI, {
  tls: true,
  tlsCAFile: '/certs/mongo-ca.crt',
  tlsCertificateKeyFile: '/certs/mongo-node.pem',
  tlsAllowInvalidHostnames: true,
  serverSelectionTimeoutMS: 30000,
  bufferCommands: false
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err.message));

const ItemSchema = new mongoose.Schema({
  name: String,
  createdAt: { type: Date, default: Date.now }
});
const Item = mongoose.model('Item', ItemSchema);

// --- Cache-Aside Pattern ---
const CACHE_KEY = 'items:all';
const CACHE_TTL = 60; // seconds

app.get('/api/items', async (req, res) => {
  try {
    const cached = await redisClient.get(CACHE_KEY);
    if (cached) {
      console.log('CACHE HIT - returning from Redis');
      return res.json(JSON.parse(cached));
    }
    console.log('CACHE MISS - querying MongoDB');
    const items = await Item.find();
    await redisClient.set(CACHE_KEY, JSON.stringify(items), 'EX', CACHE_TTL);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const item = new Item({ name: req.body.name });
    await item.save();
    await redisClient.del(CACHE_KEY);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { name: req.body.name },
      { new: true }
    );
    await redisClient.del(CACHE_KEY);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    await redisClient.del(CACHE_KEY);
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the Backend!' });
});

app.listen(3000, () => {
  console.log('Backend running on port 3000');
});
