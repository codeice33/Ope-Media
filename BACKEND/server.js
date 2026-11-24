/**
 * OPE MEDIA — Secure Backend API (Node.js + Express + MongoDB)
 * ------------------------------------------------------------
 * - Admin credentials live ONLY in MongoDB (bcrypt-hashed).
 * - Admin routes are protected with JWT Bearer authentication.
 * - Public routes expose only the landing page config and click tracking.
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// Ensure required secrets exist before starting
if (!MONGODB_URI || !JWT_SECRET) {
  console.error('❌ Missing MONGODB_URI or JWT_SECRET in your .env file.');
  process.exit(1);
}

// =========================================================
// 1. MIDDLEWARE
// =========================================================
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '100kb' }));

// =========================================================
// 2. MONGOOSE SCHEMAS & MODELS
// =========================================================
const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true, // Stored as a bcrypt hash
    },
  },
  { timestamps: true }
);

const siteConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },
    brandName: { type: String, default: 'OPE MEDIA' },
    headlineTop: { type: String, default: 'In order to' },
    headlineMain: { type: String, default: 'Start Building High-Value Digital Skills...' },
    subheading: { type: String, default: 'You Will Need These 3 Things' },
    req1: { type: String, default: 'An internet-connected smartphone, tablet or laptop' },
    req2: { type: String, default: '1–2 hrs a day' },
    req3: { type: String, default: 'A spirit of implementation and dedication' },
    confirmText: {
      type: String,
      default: "YES! I have these 3 things and I'm ready to start learning and applying these skills.",
    },
    footerText: { type: String, default: '© 2026 OPE MEDIA' },
    destinationUrl: { type: String, default: 'https://wa.me/2348000000000' },
    ctaText: { type: String, default: 'CLICK HERE TO REGISTER NOW!' },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Admin = mongoose.model('Admin', adminSchema);
const SiteConfig = mongoose.model('SiteConfig', siteConfigSchema);

// Helper: Fetch or auto-seed the single live site configuration document
async function getOrCreateConfig() {
  let config = await SiteConfig.findOne({ key: 'main' });
  if (!config) {
    config = await SiteConfig.create({ key: 'main' });
  }
  return config;
}

// =========================================================
// 3. JWT AUTHENTICATION MIDDLEWARE (Protects Admin Routes)
// =========================================================
function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized. Please sign in.' });
    }

    const token = authHeader.slice(7).trim();
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }
}

// =========================================================
// 4. PUBLIC ROUTES
// =========================================================

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'OPE MEDIA API' });
});

// Load live landing page copy, link, and click count
app.get('/api/config', async (_req, res) => {
  try {
    const config = await getOrCreateConfig();
    res.json(config);
  } catch (err) {
    console.error('GET /api/config error:', err);
    res.status(500).json({ message: 'Failed to load site configuration.' });
  }
});

// Track registration button click
app.post('/api/config/click', async (_req, res) => {
  try {
    const updated = await SiteConfig.findOneAndUpdate(
      { key: 'main' },
      { $inc: { clicks: 1 } },
      { new: true, upsert: true }
    );
    res.json({ clicks: updated.clicks });
  } catch (err) {
    console.error('POST /api/config/click error:', err);
    res.status(500).json({ message: 'Failed to record click.' });
  }
});

// =========================================================
// 5. ADMIN ROUTES (Login + JWT-Protected Updates)
// =========================================================

// Admin Sign In (verifies hashed password in MongoDB)
app.post('/api/admin/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: admin._id.toString(), email: admin.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, email: admin.email });
  } catch (err) {
    console.error('POST /api/admin/login error:', err);
    res.status(500).json({ message: 'Authentication failed. Please try again.' });
  }
});

// Verify existing JWT session
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ valid: true, email: req.admin.email });
});

// Update destination link, copy, or reset clicks (Protected)
app.put('/api/admin/config', requireAdmin, async (req, res) => {
  try {
    const allowedFields = [
      'brandName',
      'headlineTop',
      'headlineMain',
      'subheading',
      'req1',
      'req2',
      'req3',
      'confirmText',
      'footerText',
      'destinationUrl',
      'ctaText',
      'clicks',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    // Validate destinationUrl if provided
    if (updates.destinationUrl !== undefined) {
      try {
        const parsed = new URL(updates.destinationUrl);
        if (parsed.protocol !== 'https:') {
          return res.status(400).json({ message: 'Destination URL must start with https://' });
        }
      } catch (_) {
        return res.status(400).json({ message: 'Invalid destination URL.' });
      }
    }

    // Ensure clicks is a valid non-negative number if provided
    if (updates.clicks !== undefined) {
      const parsedClicks = Number(updates.clicks);
      if (!Number.isFinite(parsedClicks) || parsedClicks < 0) {
        return res.status(400).json({ message: 'Invalid click count value.' });
      }
      updates.clicks = Math.floor(parsedClicks);
    }

    const updated = await SiteConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: updates },
      { new: true, upsert: true }
    );

    res.json(updated);
  } catch (err) {
    console.error('PUT /api/admin/config error:', err);
    res.status(500).json({ message: 'Failed to save configuration.' });
  }
});

// =========================================================
// 6. CONNECT TO MONGODB & START SERVER
// =========================================================
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`🚀 OPE MEDIA API running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });