const required = ['APP_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','DATABASE_URL'];
let failed = false;
for (const name of required) {
  const value = process.env[name];
  if (!value || /YOUR_|REPLACE_|example\.com/.test(value)) { console.error(`${name}: missing or placeholder`); failed = true; }
  else console.log(`${name}: configured`);
}
for (const name of ['APP_URL','NEXT_PUBLIC_SUPABASE_URL','DATABASE_URL']) {
  if (!process.env[name]) continue;
  try {
    const url = new URL(process.env[name]);
    if (name === 'DATABASE_URL' ? !['postgres:', 'postgresql:'].includes(url.protocol) : !['http:', 'https:'].includes(url.protocol)) throw new Error();
    if (name === 'APP_URL' && (url.pathname !== '/' || url.search || url.hash || url.username || url.password)) throw new Error();
    if (name !== 'DATABASE_URL' && !['localhost','127.0.0.1'].includes(url.hostname) && url.protocol !== 'https:') throw new Error();
  } catch { console.error(`${name}: invalid URL`); failed = true; }
}
if (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_secret_')) { console.error('A server secret must never be placed in a NEXT_PUBLIC variable.'); failed = true; }
if (failed) process.exitCode = 1;
else console.log('Environment checks passed. Run migrations before launching the app.');
