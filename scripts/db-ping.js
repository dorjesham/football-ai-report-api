'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

function serverUrlFromDatabaseUrl(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    u.pathname = '/';
    return u.toString();
  } catch {
    return null;
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill in values.');
    process.exit(1);
  }

  const dbNameMatch = databaseUrl.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : null;

  let conn;
  try {
    conn = await mysql.createConnection(databaseUrl);
  } catch (err) {
    if (err.code === 'ER_BAD_DB_ERROR' && dbName) {
      const serverUrl = serverUrlFromDatabaseUrl(databaseUrl);
      if (!serverUrl) throw err;
      const admin = await mysql.createConnection(serverUrl);
      await admin.query(
        'CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
        [dbName]
      );
      await admin.end();
      conn = await mysql.createConnection(databaseUrl);
    } else {
      throw err;
    }
  }

  try {
    const [rows] = await conn.query(
      'SELECT 1 AS ok, DATABASE() AS current_db, @@hostname AS server_host, VERSION() AS version'
    );
    console.log('MySQL connection OK:', rows[0]);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('MySQL connection failed:', e.message);
  process.exit(1);
});
