require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../db');

const SALT_ROUNDS = 10;

async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set (check api/.env)');
    process.exitCode = 1;
    return;
  }

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
  if (existing.length > 0) {
    console.log(`User "${ADMIN_EMAIL}" already exists (id=${existing[0].id}) - skipping, nothing changed`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  const [result] = await pool.execute(
    'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
    [ADMIN_EMAIL, passwordHash, 'admin']
  );

  console.log(`Created admin user "${ADMIN_EMAIL}" (id=${result.insertId})`);
}

main()
  .catch((err) => {
    console.error('Failed to seed admin user:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
