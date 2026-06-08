const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Redis = require('ioredis');
const multer = require('multer');
const { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const app = express();

app.use(cors());
app.use(express.json());

// --- MinIO / S3 Client (internal) ---
// Used for API calls: upload, create bucket, etc.
// Uses minio1 hostname which is only resolvable inside Docker network
const s3 = new S3Client({
  endpoint: 'http://minio1:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD,
  },
});

// --- MinIO / S3 Client (public) ---
// Used ONLY for generating presigned URLs
// Uses localhost:9000 so the browser can reach it directly
// The signature must be generated with the same hostname the browser will use
const s3Public = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER,
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD,
  },
});

const BUCKET_NAME = 'user-assets';

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    console.log('Bucket already exists:', BUCKET_NAME);
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
      console.log('Bucket created:', BUCKET_NAME);
    } else {
      console.error('Error checking bucket:', err.message);
    }
  }
}

const upload = multer({ storage: multer.memoryStorage() });

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
}).then(() => {
  console.log('Connected to MongoDB');
  ensureBucket();
}).catch(err => console.error('MongoDB connection error:', err.message));

const ItemSchema = new mongoose.Schema({
  name: String,
  createdAt: { type: Date, default: Date.now }
});
const Item = mongoose.model('Item', ItemSchema);

const CACHE_KEY = 'items:all';
const CACHE_TTL = 60;

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

// Upload route — streams file to MinIO, returns presigned URL
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const fileKey = `uploads/${Date.now()}-${req.file.originalname}`;

    // Upload using internal s3 client (minio1:9000)
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    // Generate presigned URL using s3Public client (localhost:9000)
    // so the browser can access it directly
    const presignedUrl = await getSignedUrl(
      s3Public,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey }),
      { expiresIn: 3600 }
    );

    console.log('File uploaded to MinIO:', fileKey);
    res.json({ message: 'File uploaded successfully', key: fileKey, url: presignedUrl });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Presign route — generates a fresh presigned URL for any existing file key
app.get('/api/presign', async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'No key provided' });

    const presignedUrl = await getSignedUrl(
      s3Public,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
      { expiresIn: 3600 }
    );

    res.json({ url: presignedUrl });
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

