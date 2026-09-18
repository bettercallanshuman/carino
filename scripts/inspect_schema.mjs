import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > -1) {
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/['"]/g, '');
    if (k === 'NEXT_PUBLIC_SUPABASE_URL') url = v;
    if (k === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' || k === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') key = v;
  }
}

async function testSelect() {
  const client = createClient(url, key);
  
  // Test 1: standard columns from phase2 schema
  const { error: err1 } = await client.from('songs').select('id, title, artist, album, duration_seconds, audio_path, cover_path, created_at');
  console.log('Select standard columns error:', err1?.message || 'NONE (Success)');

  // Test 2: with genre column
  const { error: err2 } = await client.from('songs').select('genre');
  console.log('Select genre column error:', err2?.message || 'NONE (Success)');
}

testSelect();
