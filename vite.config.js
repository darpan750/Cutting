import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const key = loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_PUBLISHABLE_KEY;
  let legacyRole;
  if (key?.split('.').length === 3) {
    try { legacyRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; }
    catch { throw new Error('The Supabase browser key is malformed.'); }
  }
  if (key && !key.startsWith('sb_publishable_') && legacyRole !== 'anon') {
    throw new Error('Set a Supabase publishable key or legacy anon key for the browser build.');
  }
  return { esbuild: { jsx:'automatic' } };
});
