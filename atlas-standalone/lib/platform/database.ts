export type Row = Record<string, unknown>;
export type QueryResult = { rows: Row[]; rowCount: number };
export type Query = (text: string, values?: unknown[]) => Promise<QueryResult>;
export type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>;

// SQL originates only in server source. Values are always sent separately.
export function parameterize(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export class Database {
  constructor(private transaction: Transaction, private userId = '') {}
  forUser(userId: string) { return new Database(this.transaction, userId); }
  prepare(sql: string) { return new Statement(this, sql); }
  async batch(statements: Statement[]) {
    return this.transaction(async query => {
      await query('SET LOCAL ROLE atlas_app');
      await query("SELECT set_config('search_path', 'atlas,pg_catalog', true)");
      await query("SELECT set_config('atlas.user_id', $1, true)", [this.userId]);
      await query("SELECT set_config('statement_timeout', '10000', true)");
      // Serialize per-student writes so record quotas and history remain atomic.
      if (statements.some(s => !/^\s*SELECT\b/i.test(s.sql))) {
        await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [this.userId]);
      }
      const results = [];
      for (const statement of statements) {
        const result = await query(parameterize(statement.sql), statement.values);
        results.push({ results: result.rows, meta: { changes: result.rowCount } });
      }
      return results;
    });
  }
}

export class Statement {
  constructor(private db: Database, public sql: string, public values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.db, this.sql, values); }
  async run() { return (await this.db.batch([this]))[0]; }
  async first<T = Row>(): Promise<T | null> { return (await this.run()).results[0] as T ?? null; }
}

