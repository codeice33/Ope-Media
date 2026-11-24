const mongoose = require('mongoose');
const app = require('../BACKEND/server');

let connectionPromise;

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) return;

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI).catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  }

  await connectionPromise;
}

module.exports = async function handler(req, res) {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    return res.status(500).json({
      message: 'Server is missing required environment configuration.',
    });
  }

  try {
    await connectToDatabase();
  } catch (error) {
    console.error('Vercel API MongoDB connection failed:', error);
    return res.status(503).json({ message: 'Service temporarily unavailable.' });
  }

  return app(req, res);
};
