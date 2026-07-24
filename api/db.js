const mysql = require('mysql2/promise');

const MYSQL_URL = process.env.MYSQL_URL || process.env.DATABASE_URL;

const pool = mysql.createPool(
  MYSQL_URL
    ? { uri: MYSQL_URL }
    : {
        host: process.env.MYSQL_HOST || 'localhost',
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'devpassword',
        database: process.env.MYSQL_DATABASE || 'fraudguard',
      }
);

module.exports = pool;
