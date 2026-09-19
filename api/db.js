const mysql = require('mysql2/promise');

const MYSQL_URL = process.env.MYSQL_URL || process.env.DATABASE_URL;

// Managed MySQL providers (e.g. Aiven) require TLS and refuse a plain
// connection outright. MYSQL_CA_CERT (the provider's CA cert, PEM contents)
// enables full certificate verification; without it we still negotiate TLS
// but don't pin the CA, which is enough to satisfy providers that mandate an
// encrypted connection without handing them a trusted-root cert to check against.
const pool = mysql.createPool(
  MYSQL_URL
    ? {
        uri: MYSQL_URL,
        ssl: process.env.MYSQL_CA_CERT
          ? { ca: process.env.MYSQL_CA_CERT }
          : { rejectUnauthorized: false },
      }
    : {
        host: process.env.MYSQL_HOST || 'localhost',
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'devpassword',
        database: process.env.MYSQL_DATABASE || 'fraudguard',
      }
);

module.exports = pool;
