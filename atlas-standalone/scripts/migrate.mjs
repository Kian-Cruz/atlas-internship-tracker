import postgres from 'postgres';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const connection = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!connection || connection.includes('YOUR_')) throw new Error('Configure DATABASE_MIGRATION_URL in .env.local first.');
const local = ['localhost','127.0.0.1','[::1]'].includes(new URL(connection).hostname);
const sql = postgres(connection, { prepare:false, max:1, ssl:local ? false : 'verify-full', connect_timeout:10 });
try {
  await sql.unsafe('CREATE SCHEMA IF NOT EXISTS atlas_meta; REVOKE ALL ON SCHEMA atlas_meta FROM PUBLIC; CREATE TABLE IF NOT EXISTS atlas_meta.migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())').simple();
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort()) {
    const source = await readFile(new URL(name,directory),'utf8');
    const checksum = createHash('sha256').update(source).digest('hex');
    await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(745691832)`;
      const [previous] = await tx`SELECT checksum FROM atlas_meta.migrations WHERE name=${name}`;
      if (previous) {
        if (previous.checksum !== checksum) throw new Error(`Applied migration ${name} was modified; add a new migration instead.`);
        console.log(`Already applied: ${name}`); return;
      }
      await tx.unsafe(source).simple();
      await tx`INSERT INTO atlas_meta.migrations (name,checksum) VALUES (${name},${checksum})`;
      console.log(`Applied: ${name}`);
    });
  }
} catch (error) {
  console.error('Migration failed. Check the connection, database permissions, and migration SQL.');
  console.error(error instanceof Error && error.message.startsWith('Applied migration') ? error.message : `Error code: ${error.code || 'CONNECTION_OR_SCHEMA_ERROR'}`);
  process.exitCode=1;
} finally { await sql.end(); }
