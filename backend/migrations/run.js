require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function run() {
  const file = path.join(__dirname, '001_init.sql');
  const sql = fs.readFileSync(file, 'utf8');

  console.log('Running migration: 001_init.sql');
  try {
    await pool.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
