require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const connectDB = require('./src/config/database');

// Route modules
const authRoutes = require('./src/routes/auth.routes');
const policyRoutes = require('./src/routes/policy.routes');
const claimRoutes = require('./src/routes/claim.routes');
const adminRoutes = require('./src/routes/admin.routes');
const userRoutes = require('./src/routes/user.routes');
const notificationRoutes = require('./src/routes/notification.routes');

const { isPipelineAvailable } = require('./src/services/python.service');

const app = express();
const PORT = process.env.PORT || 5001;

// Startup safety checks
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// ==================== DIRECTORY SETUP ====================

['uploads', 'temp', 'data'].forEach((dir) => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ==================== SECURITY & MIDDLEWARE ====================

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limit for auth endpoints (OTP brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many auth attempts, try again later' },
});

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000'];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return cb(null, true);
      }
      cb(new Error('CORS policy violation'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== DATABASE CONNECTION ====================

connectDB();

// ==================== ROUTES ====================

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    pythonWorker: isPipelineAvailable() ? 'available' : 'fallback_mode',
    version: '4.0.0',
  });
});

app.get('/', (_req, res) => {
  res.json({
    message: 'PBI Agriculture Insurance Backend API',
    version: '4.0.0',
    endpoints: {
      auth: '/api/auth',
      insurance: '/api/insurance',
      claims: '/api/claims',
      admin: '/api/admin',
      user: '/api/user',
      notifications: '/api/notifications',
      health: '/health',
    },
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/insurance', policyRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/notifications', notificationRoutes);

// ==================== ERROR HANDLING ====================

app.use('*', (_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

app.use((error, _req, res, _next) => {
  console.error('Global error:', error);
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: error.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 50 MB)' : error.message,
    });
  }
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
  });
});

// ==================== GRACEFUL SHUTDOWN ====================

const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if (server) {
    server.close(() => console.log('✅ HTTP server closed'));
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
  }
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  gracefulShutdown();
});

// ==================== START SERVER ====================

const server = app.listen(PORT, () => {
  console.log(`\n🚀 PBI AgriInsure Backend v4.0`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Health: http://localhost:${PORT}/health`);
  console.log(`🐍 Python Worker: ${isPipelineAvailable() ? 'Available' : 'Fallback Mode'}`);
  console.log(`🔐 CORS: ${allowedOrigins.join(', ')}\n`);
});

module.exports = app;
