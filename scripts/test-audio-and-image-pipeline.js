
async function testPipeline() {
  console.log('=== STARTING END-TO-END AUDIO & IMAGE PIPELINE TEST ===\n');

  // 1. Create realistic test audio (mock MP3 header) and cover (valid JPEG header)
  const testMp3Buffer = Buffer.alloc(10000);
  // ID3v2 header
  testMp3Buffer.write('ID3', 0);
  testMp3Buffer[3] = 3;
  testMp3Buffer[4] = 0;

  const testJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0xff, 0xd9
  ]);

  const testSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ec4899"/><text x="50" y="50" fill="#fff" text-anchor="middle">CARIÑO</text></svg>`;

  // 2. Upload Audio File
  console.log('1. Testing POST /api/upload/file (Audio)');
  const audioFormData = new FormData();
  audioFormData.append('bucket', 'audio');
  audioFormData.append('file', new Blob([testMp3Buffer], { type: 'audio/mpeg' }), 'Low-Fade-1.mp3');

  const audioUploadRes = await fetch('http://localhost:3000/api/upload/file', {
    method: 'POST',
    body: audioFormData,
  });
  console.log('Audio upload status:', audioUploadRes.status);
  const audioUploadData = await audioUploadRes.json();
  console.log('Audio upload result:', audioUploadData);
  if (!audioUploadData.path) throw new Error('Audio upload failed');

  // 3. Upload Cover Image File
  console.log('\n2. Testing POST /api/upload/file (Cover Artwork)');
  const coverFormData = new FormData();
  coverFormData.append('bucket', 'covers');
  coverFormData.append('file', new Blob([testJpgBuffer], { type: 'image/jpeg' }), 'Low-Fade-1.jpg');

  const coverUploadRes = await fetch('http://localhost:3000/api/upload/file', {
    method: 'POST',
    body: coverFormData,
  });
  console.log('Cover upload status:', coverUploadRes.status);
  const coverUploadData = await coverUploadRes.json();
  console.log('Cover upload result:', coverUploadData);
  if (!coverUploadData.path) throw new Error('Cover upload failed');

  // 4. Save Song in Library
  console.log('\n3. Testing POST /api/songs (Registering Song)');
  const songRes = await fetch('http://localhost:3000/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Low Fade',
      artist: 'Karan Aujla',
      album: 'Street Dreams',
      duration_seconds: 179,
      audio_path: audioUploadData.path,
      cover_path: coverUploadData.path,
    }),
  });
  console.log('Song creation status:', songRes.status);
  const songData = await songRes.json();
  console.log('Song data:', songData.song);
  if (!songData.song?.audio_url || !songData.song?.cover_url) {
    throw new Error('Song URLs not generated properly');
  }

  // 5. Test Audio Streaming & Range Requests
  console.log('\n4. Testing GET /api/media (Standard Audio Retrieval)');
  const audioStreamUrl = `http://localhost:3000${songData.song.audio_url}`;
  const audioGetRes = await fetch(audioStreamUrl);
  console.log('Audio GET status:', audioGetRes.status);
  console.log('Audio Content-Type:', audioGetRes.headers.get('content-type'));
  console.log('Audio Accept-Ranges:', audioGetRes.headers.get('accept-ranges'));
  console.log('Audio Content-Length:', audioGetRes.headers.get('content-length'));

  if (audioGetRes.status !== 200 || audioGetRes.headers.get('content-type') !== 'audio/mpeg') {
    throw new Error('Audio streaming failed: status is not 200 or MIME is not audio/mpeg');
  }

  console.log('\n5. Testing HTTP 206 Range Request (Seeking in Audio)');
  const rangeRes = await fetch(audioStreamUrl, {
    headers: { Range: 'bytes=0-1023' },
  });
  console.log('Range request status:', rangeRes.status);
  console.log('Content-Range:', rangeRes.headers.get('content-range'));
  console.log('Content-Length:', rangeRes.headers.get('content-length'));

  if (rangeRes.status !== 206) {
    throw new Error(`Range request failed: expected 206 Partial Content, got ${rangeRes.status}`);
  }

  // 6. Test Cover Image Retrieval
  console.log('\n6. Testing GET /api/media (Cover Artwork Retrieval)');
  const coverStreamUrl = `http://localhost:3000${songData.song.cover_url}`;
  const coverGetRes = await fetch(coverStreamUrl);
  console.log('Cover GET status:', coverGetRes.status);
  console.log('Cover Content-Type:', coverGetRes.headers.get('content-type'));
  console.log('Cover Content-Length:', coverGetRes.headers.get('content-length'));

  if (coverGetRes.status !== 200 || coverGetRes.headers.get('content-type') !== 'image/jpeg') {
    throw new Error('Cover retrieval failed: status is not 200 or MIME is not image/jpeg');
  }

  // 7. Test SVG Cover Artwork Upload & Retrieval
  console.log('\n7. Testing SVG Cover Artwork Upload');
  const svgFormData = new FormData();
  svgFormData.append('bucket', 'covers');
  svgFormData.append('file', new Blob([testSvgContent], { type: 'image/svg+xml' }), 'badge.svg');

  const svgUploadRes = await fetch('http://localhost:3000/api/upload/file', {
    method: 'POST',
    body: svgFormData,
  });
  const svgUploadData = await svgUploadRes.json();
  const svgGetRes = await fetch(`http://localhost:3000${svgUploadData.url}`);
  console.log('SVG GET status:', svgGetRes.status);
  console.log('SVG Content-Type:', svgGetRes.headers.get('content-type'));
  if (svgGetRes.status !== 200 || svgGetRes.headers.get('content-type') !== 'image/svg+xml') {
    throw new Error('SVG cover failed');
  }

  // 8. Test Library Refresh Persistence
  console.log('\n8. Testing GET /api/songs (Verifying Persistence Across Refresh)');
  const libraryRes = await fetch('http://localhost:3000/api/songs');
  const librarySongs = await libraryRes.json();
  const foundUploadedSong = librarySongs.find(s => s.title === 'Low Fade');
  console.log('Found uploaded song in library after reload?', Boolean(foundUploadedSong));
  console.log('Uploaded song audio_url:', foundUploadedSong?.audio_url);
  console.log('Uploaded song cover_url:', foundUploadedSong?.cover_url);

  if (!foundUploadedSong) {
    throw new Error('Uploaded song did not persist across reload');
  }

  // 9. Test Next.js Image Optimizer on /api/media with query string (Validating localPatterns)
  console.log('\n9. Testing Next.js Image Optimization on local /api/media URL');
  const nextImageUrl = `http://localhost:3000/_next/image?url=${encodeURIComponent(songData.song.cover_url)}&w=96&q=75`;
  const nextImageRes = await fetch(nextImageUrl);
  console.log('Next.js Image Optimizer response status:', nextImageRes.status);
  console.log('Next.js Image Optimizer Content-Type:', nextImageRes.headers.get('content-type'));

  console.log('\n=== ALL END-TO-END TESTS PASSED SUCCESSFULLY! ===');
}

testPipeline().catch(err => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});
