require('dotenv').config();
const mongoose = require('mongoose');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Import User model (Old)
const UserSchema = new mongoose.Schema({
  email: String,
  phoneNumber: String,
  password: { type: String },
  fullName: { type: String },
  avatarUrl: { type: String },
  role: { type: String, default: 'USER' },
  isLocked: { type: Boolean, default: false }
}, { timestamps: true });

const MongoUser = mongoose.model('User', UserSchema);

async function migrate() {
  console.log('--- Starting Corrective Migration ---');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const mongoUsers = await MongoUser.find();
    console.log(`Found ${mongoUsers.length} users in MongoDB.`);

    let migratedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;

    for (const u of mongoUsers) {
      const mongoId = u._id.toString();
      try {
        // 1. Check if the user already exists with the CORRECT ID
        const existingById = await prisma.user.findUnique({
          where: { id: mongoId }
        });

        if (existingById) {
          skippedCount++;
          continue;
        }

        // 2. Check if a user exists with this email but WRONG ID
        const existingByEmail = await prisma.user.findUnique({
          where: { email: u.email }
        });

        if (existingByEmail) {
          console.log(`CONFLICT: Email ${u.email} already exists with different ID ${existingByEmail.id}. Fixing...`);
          // Delete the record with the wrong ID and re-create it with the correct MongoDB ID
          await prisma.user.delete({ where: { id: existingByEmail.id } });
          conflictCount++;
        }

        // 3. Create the user with the original MongoDB ID
        await prisma.user.create({
          data: {
            id: mongoId,
            email: u.email || null,
            phoneNumber: u.phoneNumber || null,
            password: u.password || null,
            fullName: u.fullName || null,
            avatarUrl: u.avatarUrl || null,
            role: u.role || 'USER',
            isLocked: u.isLocked || false,
            createdAt: u.createdAt || new Date()
          }
        });
        migratedCount++;
      } catch (err) {
        console.error(`Failed to migrate user ${u.email}:`, err.message);
      }
    }

    console.log(`Migration completed: ${migratedCount} migrated (including ${conflictCount} fixed conflicts), ${skippedCount} exactly matched.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
    console.log('Disconnected from both databases');
  }
}

migrate();
