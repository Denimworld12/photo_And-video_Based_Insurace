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

const { isPipelineAvailable, PIPELINE_PATH } = require('./src/services/python.service');
const { assertDeliveryConfigured, isMockMode } = require('./src/services/otp.service');
const { MAX_FILE_SIZE } = require('./src/middleware/upload');

const app = express();
const PORT = process.env.PORT || 5001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ==================== STARTUP SAFETY CHECKS ====================

const fatal = (message) => {
  console.error(`FATAL: ${message}`);
  process.exit(1);
};

if (!process.env.JWT_SECRET) {
  fatal('JWT_SECRET environment variable is not set');
}
if (IS_PRODUCTION && process.env.JWT_SECRET.length < 32) {
  fatal('JWT_SECRET must be at least 32 characters in production');
}
if (IS_PRODUCTION && !process.env.MONGODB_URI) {
  fatal('MONGODB_URI environment variable is required in production');
}
if (IS_PRODUCTION && !process.env.ALLOWED_ORIGINS) {
  fatal('ALLOWED_ORIGINS environment variable is required in production');
}

try {
  // Refuses to start with an OTP delivery mode that would not actually
  // authenticate anyone. Better to fail here than to serve an open login.
  assertDeliveryConfigured();
} catch (err) {
  fatal(err.message);
}

// ==================== DIRECTORY SETUP ====================

['uploads', 'temp', 'data'].forEach((dir) => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ==================== SECURITY & MIDDLEWARE ====================

// Rate limiting and AdminAction.ipAddress both read req.ip. Behind a proxy that
// is the proxy's address unless the hop count is declared, which would make one
// bucket for every client.
if (process.env.TRUST_PROXY) {
  const raw = process.env.TRUST_PROXY.trim();
  const hops = Number(raw);
  const setting =
    raw === 'true' ? true : raw === 'false' ? false : Number.isInteger(hops) && hops >= 0 ? hops : raw;
  try {
    // Express compiles this eagerly, so an unusable value is caught here rather
    // than surfacing as an opaque TypeError from proxy-addr.
    app.set('trust proxy', setting);
  } catch (err) {
    fatal(
      `TRUST_PROXY="${raw}" is not a usable trust proxy setting (${err.message}). ` +
        'Use a hop count (e.g. 1), true/false, or a comma-separated list of trusted addresses.'
    );
  }
}

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    // Claim evidence under /uploads has to be loadable by the frontend, which
    // runs on a different origin, so helmet's default same-origin CORP is
    // relaxed here. This widens who may embed an upload, not who may read one:
    // the filenames are unguessable and nosniff still applies.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
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
  max: IS_PRODUCTION ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter rate limit for auth endpoints (OTP brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many auth attempts, try again later' },
});

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:3000'];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || !IS_PRODUCTION) {
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

// Claim evidence. `index: false` so the directory is never listed, and nosniff
// so a stored file cannot be re-interpreted as a script by the browser.
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'), {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);

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
    pythonWorker: isPipelineAvailable() ? 'available' : 'unavailable',
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
    const messages = {
      LIMIT_FILE_SIZE: `File too large (max ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB)`,
      LIMIT_UNEXPECTED_FILE:
        'File rejected: its media type is not accepted, or it was not sent as the "image" field.',
      LIMIT_FILE_COUNT: 'Too many files in one request',
      LIMIT_FIELD_VALUE: 'A form field exceeded the allowed size',
    };
    return res.status(400).json({ success: false, error: messages[error.code] || 'Upload rejected' });
  }

  if (error.message === 'CORS policy violation') {
    return res.status(403).json({ success: false, error: 'Origin not allowed' });
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request body too large' });
  }

  res.status(500).json({
    success: false,
    error: IS_PRODUCTION ? 'Internal server error' : error.message,
  });
});

// ==================== GRACEFUL SHUTDOWN ====================

let server = null;
let shuttingDown = false;

// A claim being processed holds its request open for as long as the pipeline
// runs, so draining connections is capped: past this point the process exits
// rather than waiting for the supervisor to SIGKILL it mid-write.
const FORCED_SHUTDOWN_MS = 10_000;

const gracefulShutdown = async (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('Shutting down gracefully...');
  const forced = setTimeout(() => {
    console.error(`Shutdown did not finish within ${FORCED_SHUTDOWN_MS} ms, exiting now`);
    process.exit(exitCode);
  }, FORCED_SHUTDOWN_MS);
  forced.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('HTTP server closed');
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  } catch (err) {
    console.error('Error during shutdown:', err.message);
  }
  clearTimeout(forced);
  process.exit(exitCode);
};

process.on('SIGTERM', () => gracefulShutdown(0));
process.on('SIGINT', () => gracefulShutdown(0));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  // The process state is no longer trustworthy after an uncaught exception, so
  // exit non-zero and let the supervisor restart it.
  console.error('Uncaught exception:', err);
  gracefulShutdown(1);
});

// ==================== START SERVER ====================

server = app.listen(PORT, () => {
  console.log('');
  console.log('PBI AgriInsure Backend v4.0');
  console.log(`  Port:          ${PORT}`);
  console.log(`  Environment:   ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Health check:  http://localhost:${PORT}/health`);
  console.log(`  Python worker: ${isPipelineAvailable() ? 'available' : `NOT FOUND at ${PIPELINE_PATH}`}`);
  console.log(`  CORS origins:  ${allowedOrigins.join(', ')}`);
  if (isMockMode()) {
    console.log('  OTP delivery:  MOCK - no SMS is sent, the code is returned in the send-otp response');
  } else {
    console.log('  OTP delivery:  SMS (Twilio)');
  }
  console.log('');
  if (IS_PRODUCTION && !isMockMode()) {
    console.error('  ############################################################');
    console.error('  WARNING: PRODUCTION OTP DELIVERY IS NOT WIRED.');
    console.error('  The Twilio send block in src/services/otp.service.js is still');
    console.error('  commented out, so POST /api/auth/send-otp reports success');
    console.error('  without sending any SMS. No account - including the admin');
    console.error('  account - can complete login until SMS delivery is');
    console.error('  implemented. Do not serve real users in this state.');
    console.error('  ############################################################');
    console.error('');
  }
});

module.exports = app;
