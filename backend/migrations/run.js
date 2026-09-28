require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function run() {
  const migrations = [
    '001_init.sql',
    '002_email_otp.sql',
  ];

  try {
    for (const fileName of migrations) {
      const file = path.join(__dirname, fileName);
      const sql = fs.readFileSync(file, 'utf8');

      console.log('Running migration: ' + fileName);
      await pool.query(sql);
      console.log('Migration applied successfully: ' + fileName);
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
