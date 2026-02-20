const fs = require('fs');
const path = require('path');
const db = require('./index');

async function runMigrations() {
  console.log('Running database migrations...');

  // Create migrations tracking table
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await db.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [file]
    );

    if (rows.length > 0) {
      console.log(`  Skipping ${file} (already run)`);
      continue;
    }

    console.log(`  Running ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.query(sql);
    await db.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1)',
      [file]
    );
    console.log(`  Done: ${file}`);
  }

  console.log('Migrations complete.');
}

async function seedData() {
  console.log('Checking seed data...');

  // Seed FOUNDER2026 invite code if it doesn't exist
  const { rows } = await db.query(
    "SELECT id FROM invite_codes WHERE code = 'FOUNDER2026'"
  );

  if (rows.length === 0) {
    await db.query(
      "INSERT INTO invite_codes (code) VALUES ('FOUNDER2026')"
    );
    console.log("  Seeded invite code: FOUNDER2026");
  } else {
    console.log("  Invite code FOUNDER2026 already exists.");
  }
}

module.exports = { runMigrations, seedData };
