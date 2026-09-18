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

const client = createClient(url, serviceKey || key);

async function auditRemote() {
  console.log('Querying remote public.songs with key type:', serviceKey ? 'service_key' : 'publishable_key');
  
  // 1. Query public.songs
  const { data: songs, error: songsErr, count } = await client
    .from('songs')
    .select('*', { count: 'exact' });

  if (songsErr) {
    console.log('Error querying public.songs:', songsErr.message);
  } else {
    console.log('Remote public.songs row count:', songs?.length, '(exact count:', count, ')');
    console.log('Remote songs list:', JSON.stringify(songs, null, 2));
  }

  // 2. Query storage buckets: 'audio' and 'covers'
  console.log('\n--- Auditing Supabase Storage "audio" ---');
  const { data: audioFiles, error: audioErr } = await client.storage.from('audio').list();
  if (audioErr) {
    console.log('Error listing audio bucket:', audioErr.message);
  } else {
    console.log('Audio bucket root objects count:', audioFiles?.length);
    console.log('Audio files:', JSON.stringify(audioFiles, null, 2));
  }

  console.log('\n--- Auditing Supabase Storage "covers" ---');
  const { data: coversFiles, error: coversErr } = await client.storage.from('covers').list();
  if (coversErr) {
    console.log('Error listing covers bucket:', coversErr.message);
  } else {
    console.log('Covers bucket root objects count:', coversFiles?.length);
    console.log('Covers files:', JSON.stringify(coversFiles, null, 2));
  }
}

auditRemote();
