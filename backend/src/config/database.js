const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      console.log('⚠️  No MONGODB_URI found – running without database');
      return null;
    }

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    return null;
  }
};

module.exports = connectDB;
