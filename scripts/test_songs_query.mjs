import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '', serviceKey = '';
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > -1) {
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/['"]/g, '');
    if (k === 'NEXT_PUBLIC_SUPABASE_URL') url = v;
    if (k === 'SUPABASE_SERVICE_ROLE_KEY' && !v.includes('your-service-role')) serviceKey = v;
    if (k === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' || k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') key = v;
  }
}

async function check() {
  console.log('--- Checking Supabase public.songs ---');
  // First, check with anon client
  const anon = createClient(url, key);
  const { data: anonSongs, error: anonErr } = await anon.from('songs').select('*');
  console.log('Anon client query:', { count: anonSongs?.length, error: anonErr?.message });

  // Second, check what happens if we sign in anonymously or test
  // Also check local songs
  const localSongsRaw = fs.readFileSync('.storage/songs.json', 'utf8');
  const localSongs = JSON.parse(localSongsRaw);
  console.log('\n--- Local .storage/songs.json ---');
  console.log('Local songs count:', localSongs.length);
  localSongs.forEach(s => console.log(`- [${s.id}] "${s.title}" by ${s.artist}`));
}

check();
