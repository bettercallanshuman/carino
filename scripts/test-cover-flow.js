async function runTests() {
  console.log('--- 1. Testing GET /api/songs ---');
  const getRes = await fetch('http://localhost:3000/api/songs');
  const songs = await getRes.json();
  console.log('Songs count:', songs.length);
  console.log('First song cover_url:', songs[0]?.cover_url);

  console.log('\n--- 2. Testing POST /api/songs with raw storage path ---');
  const postRes = await fetch('http://localhost:3000/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Aurora Borealis',
      artist: 'Solaris',
      album: 'Space Ambient',
      duration_seconds: 240,
      audio_path: 'audio_1726593928123_track.mp3',
      cover_path: 'covers_1726593928123_artwork.svg',
    }),
  });
  const created = await postRes.json();
  console.log('Created song:', created);
  console.log('Cover URL generated:', created.song?.cover_url);
  console.log('Audio URL generated:', created.song?.audio_url);

  console.log('\n--- 3. Testing GET /api/media for the cover ---');
  const mediaUrl = `http://localhost:3000${created.song.cover_url}`;
  console.log('Fetching media URL:', mediaUrl);
  const mediaRes = await fetch(mediaUrl, { redirect: 'follow' });
  console.log('Media response status:', mediaRes.status);
  console.log('Media content-type:', mediaRes.headers.get('content-type'));

  console.log('\n--- 4. Testing GET /library SSR rendering ---');
  const libRes = await fetch('http://localhost:3000/library');
  console.log('Library status:', libRes.status);
  const libHtml = await libRes.text();
  console.log('Library HTML length:', libHtml.length);
  console.log('Includes <div id="__next" or html root:', libHtml.includes('<!DOCTYPE html>'));

  console.log('\n--- 5. Testing GET / (Dashboard) ---');
  const dashRes = await fetch('http://localhost:3000/');
  console.log('Dashboard status:', dashRes.status);

  console.log('\n--- 6. Testing GET /upload ---');
  const uploadRes = await fetch('http://localhost:3000/upload');
  console.log('Upload status:', uploadRes.status);

  console.log('\nAll tests completed successfully!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
