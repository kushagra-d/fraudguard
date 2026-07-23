const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'devpassword',
  database: 'fraudguard',
});

module.exports = pool;
