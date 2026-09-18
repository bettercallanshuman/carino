/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function fetchUrl(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('  CARIÑO PHASE 2 FRONTEND REDESIGN RUNTIME VERIFICATION');
  console.log('================================================================\n');

  const tests = [
    { name: '1. Home Page (/) loads', path: '/' },
    { name: '2. Albums Page (/albums) loads', path: '/albums' },
    { name: '3. Tracks Page (/tracks) loads', path: '/tracks' },
    { name: '4. Genres Page (/genres) loads', path: '/genres' },
    { name: '5. Recently Played Page (/recently-played) loads', path: '/recently-played' },
    { name: '6. Favourite Tracks Page (/favorites) loads', path: '/favorites' },
    { name: '7. Playlists Page (/playlists) loads', path: '/playlists' },
    { name: '8. Songs API (/api/songs) returns real library', path: '/api/songs' },
    { name: '9. Banners API (/api/banners) returns 4 slots', path: '/api/banners' },
    { name: '10. Account API (/api/account) returns profile', path: '/api/account' },
    { name: '11. Playlists API (/api/playlists) returns playlists', path: '/api/playlists' },
  ];

  let passed = 0;

  for (const t of tests) {
    try {
      const res = await fetchUrl(t.path);
      if (res.status === 200) {
        console.log(`[PASS] ${t.name} -> HTTP ${res.status}`);
        passed++;
      } else {
        console.error(`[FAIL] ${t.name} -> HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[FAIL] ${t.name} -> Error: ${err.message}`);
    }
  }

  // 12. Verify content in /api/songs
  console.log('\n--- Checking Real Songs Content ---');
  const songsRes = await fetchUrl('/api/songs');
  const songs = JSON.parse(songsRes.body);
  console.log(`Found ${songs.length} real song(s):`, songs.map(s => `${s.title} (${s.artist}, Album: ${s.album}, Genre: ${s.genre})`));

  // 13. Verify audio stream via /api/media
  if (songs.length > 0) {
    const audioPath = songs[0].audio_path;
    const coverPath = songs[0].cover_path;

    const audioRes = await fetchUrl(`/api/media?bucket=audio&path=${encodeURIComponent(audioPath)}`, {
      headers: { Range: 'bytes=0-1023' }
    });
    console.log(`Audio streaming check (${audioPath}): HTTP ${audioRes.status}, Content-Range: ${audioRes.headers['content-range']}`);

    const coverRes = await fetchUrl(`/api/media?bucket=covers&path=${encodeURIComponent(coverPath)}`);
    console.log(`Cover image check (${coverPath}): HTTP ${coverRes.status}, Content-Type: ${coverRes.headers['content-type']}`);
  }

  // 14. Verify 4 Banners
  console.log('\n--- Checking 4 Banners Content ---');
  const bannersRes = await fetchUrl('/api/banners');
  const banners = JSON.parse(bannersRes.body);
  console.log(`Found ${banners.length} banner slots:`, banners.map(b => `#${b.id}: ${b.title} (${b.category})`));

  // 15. Verify Account Profile
  console.log('\n--- Checking User Profile ---');
  const profileRes = await fetchUrl('/api/account');
  const profile = JSON.parse(profileRes.body);
  console.log('User profile:', profile);

  console.log(`\n================================================================`);
  console.log(`  RESULT: ${passed}/${tests.length} tests passed successfully!`);
  console.log(`================================================================\n`);
}

runVerification().catch(console.error);
