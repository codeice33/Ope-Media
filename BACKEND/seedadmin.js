/**
 * OPE MEDIA — Developer Admin Account Seeder
 * ------------------------------------------
 * Run this once from your terminal (`npm run seed`) to securely create
 * or update your admin login in MongoDB with a bcrypt-hashed password.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('❌ Please set MONGODB_URI, ADMIN_EMAIL, and ADMIN_PASSWORD in BACKEND/.env');
  process.exit(1);
}

if (ADMIN_PASSWORD.length < 8) {
  console.error('❌ ADMIN_PASSWORD must be at least 8 characters long.');
  process.exit(1);
}

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
});

const Admin = mongoose.model('Admin', adminSchema);

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await Admin.findOneAndUpdate(
      { email: ADMIN_EMAIL },
      { email: ADMIN_EMAIL, password: hashedPassword },
      { upsert: true, new: true }
    );

    console.log(`✅ Admin account ready in MongoDB for: ${ADMIN_EMAIL}`);
    console.log('ℹ️  You can now remove ADMIN_PASSWORD from .env if desired.');
  } catch (err) {
    console.error('❌ Failed to seed admin account:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seed();