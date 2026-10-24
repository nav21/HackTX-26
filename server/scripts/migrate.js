// Applies supabase/schema.sql to DATABASE_URL in one transaction, then prints a summary.
// Usage (from /server): npm run db:migrate            apply + summary
//                       npm run db:migrate -- --check  summary only
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const SCHEMA = path.join(import.meta.dirname, '..', '..', 'supabase', 'schema.sql');
const checkOnly = process.argv.includes('--check');

if (!process.env.DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is not set in server/.env (use the Supabase session pooler URI).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function summary() {
  const tables = await client.query(`
    select c.relname as table, c.relrowsecurity as rls,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname`);
  console.log('\nTables in public:');
  console.table(tables.rows);

  const noRls = tables.rows.filter((r) => !r.rls);
  if (noRls.length) console.warn(`[migrate] WARNING: RLS disabled on: ${noRls.map((r) => r.table).join(', ')}`);

  const pub = await client.query(
    `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1`
  );
  console.log(`Realtime publication: ${pub.rows.map((r) => r.tablename).join(', ') || '(none)'}`);

  const fns = await client.query(`
    select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('is_device_member', 'is_device_owner', 'is_group_member', 'append_event', 'claim_scheduler_lease',
       'handle_new_user', 'handle_user_email_change')
    order by 1`);
  console.log('Function EXECUTE privileges:');
  console.table(fns.rows);
}

try {
  await client.connect();
  if (!checkOnly) {
    const sql = await readFile(SCHEMA, 'utf8');
    const started = Date.now();
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
    console.log(`[migrate] Applied supabase/schema.sql in ${Date.now() - started} ms`);
  }
  await summary();
} catch (err) {
  console.error('[migrate] FAILED:', err.message, err.position ? `(at char ${err.position})` : '');
  process.exitCode = 1;
} finally {
  await client.end();
}
