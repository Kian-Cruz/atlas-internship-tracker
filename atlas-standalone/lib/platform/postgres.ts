import 'server-only';
import postgres from 'postgres';
import { Database, type Transaction } from './database';

let database: Database | undefined;
export function getDatabase(userId = '') {
  if (!database) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const url = new URL(process.env.DATABASE_URL);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    // Transaction poolers cannot use named prepared statements.
    const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, ssl: local ? false : 'verify-full' });
    const transaction: Transaction = async work => {
      const value = await sql.begin(async tx => work(async (text, values = []) => {
        const rows = await tx.unsafe(text, values as never[]);
        return { rows: [...rows], rowCount: rows.count };
      }));
      return value as Awaited<ReturnType<typeof work>>;
    };
    database = new Database(transaction);
  }
  return database.forUser(userId);
}

