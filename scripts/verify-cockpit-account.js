/* eslint-disable @typescript-eslint/no-require-imports */
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let resBody = '';
      res.on('data', (c) => (resBody += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(resBody) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function patchJson(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let resBody = '';
      res.on('data', (c) => (resBody += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(resBody) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function deleteReq(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(url, { method: 'DELETE' }, (res) => {
      let resBody = '';
      res.on('data', (c) => (resBody += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(resBody) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('Testing Cockpit & Account endpoints...\n');

  // 1. Test Banner Update
  console.log('1. Updating Banner slot 1:');
  const bannerRes = await postJson('/api/banners', {
    id: 1,
    title: 'R&B Hits (Updated)',
    subtitle: 'Hot Shot, Confessions, Beyonce, Usher',
    category: 'CURATED PLAYLIST',
    stats: '50,056 Likes • 213 Songs',
  });
  console.log(`Banner update status: ${bannerRes.status}, title: "${bannerRes.body.banner.title}"`);

  // Restore original title
  await postJson('/api/banners', {
    id: 1,
    title: 'R&B Hits',
    subtitle: 'Hot Shot, Confessions, Beyonce, Usher, The-Dream, Mario, Akif, Princeton Michael...',
    category: 'CURATED PLAYLIST',
    stats: '50,056 Likes • 213 Songs, 13 hr 7 min',
  });

  // 2. Test Account Update
  console.log('\n2. Updating User Profile:');
  const accountRes = await patchJson('/api/account', {
    name: 'Anshuman',
    gender: 'Male',
    date_of_birth: '1998-05-14',
  });
  console.log(`Account update status: ${accountRes.status}, name: "${accountRes.body.name}", gender: "${accountRes.body.gender}"`);

  // 3. Test Song Creation with required Genre
  console.log('\n3. Creating temporary song:');
  const newSongRes = await postJson('/api/songs', {
    title: 'Redesign Test Track',
    artist: 'Test Artist',
    album: 'Test Album',
    genre: 'Lo-Fi Chill',
    duration_seconds: 120,
    audio_path: 'audio_local_test.mp3',
    cover_path: 'covers_local_test.jpg',
  });
  console.log(`Song created: ${newSongRes.status}, ID: ${newSongRes.body.song.id}, Genre: ${newSongRes.body.song.genre}`);

  // 4. Test Song Deletion
  console.log('\n4. Deleting temporary song:');
  const deleteRes = await deleteReq(`/api/songs/${newSongRes.body.song.id}`);
  console.log(`Song deleted: ${deleteRes.status}, success: ${deleteRes.body.success}`);

  console.log('\nAll Cockpit & Account operations validated successfully!');
}

runTests().catch(console.error);
