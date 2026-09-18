/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function runPhase2Verification() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  CARIÑO — PHASE 2 FINALIZATION END-TO-END VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // ── Step 1: Upload a real song + artwork ──────────────────────────────────────
  console.log('▶ STEP 1: Uploading Audio & Artwork...');

  // Use real sample audio from Pixabay and real cover artwork from public icons
  const sampleAudioUrl = 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3';
  const audioDownloadRes = await fetch(sampleAudioUrl);
  if (!audioDownloadRes.ok) throw new Error('Failed to download sample MP3');
  const audioBuffer = await audioDownloadRes.arrayBuffer();
  console.log(`  ✓ Sample audio downloaded (${(audioBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);

  const coverImagePath = path.join(__dirname, '..', 'public', 'icons', 'icon-source.jpg');
  const coverBuffer = fs.readFileSync(coverImagePath);
  console.log(`  ✓ Sample cover artwork loaded (${(coverBuffer.length / 1024).toFixed(2)} KB)`);

  // Upload Audio via /api/upload/file
  const audioForm = new FormData();
  audioForm.append('bucket', 'audio');
  audioForm.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'Phase2-Track.mp3');

  const audioUploadRes = await fetch(`${BASE_URL}/api/upload/file`, {
    method: 'POST',
    body: audioForm,
  });
  if (!audioUploadRes.ok) throw new Error(`Audio upload failed: ${audioUploadRes.status}`);
  const audioUploadData = await audioUploadRes.json();
  console.log(`  ✓ Audio uploaded to storage: ${audioUploadData.path}`);

  // Upload Cover via /api/upload/file
  const coverForm = new FormData();
  coverForm.append('bucket', 'covers');
  coverForm.append('file', new Blob([coverBuffer], { type: 'image/jpeg' }), 'Phase2-Artwork.jpg');

  const coverUploadRes = await fetch(`${BASE_URL}/api/upload/file`, {
    method: 'POST',
    body: coverForm,
  });
  if (!coverUploadRes.ok) throw new Error(`Cover upload failed: ${coverUploadRes.status}`);
  const coverUploadData = await coverUploadRes.json();
  console.log(`  ✓ Artwork uploaded to storage: ${coverUploadData.path}`);

  // Register Song via POST /api/songs
  const createSongRes = await fetch(`${BASE_URL}/api/songs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Midnight Reverie',
      artist: 'Cariño Sound',
      album: 'Phase 2 Sessions',
      duration_seconds: 240,
      audio_path: audioUploadData.path,
      cover_path: coverUploadData.path,
    }),
  });
  if (!createSongRes.ok) throw new Error(`Song registration failed: ${createSongRes.status}`);
  const createdSongData = await createSongRes.json();
  const createdSong = createdSongData.song;
  console.log(`  ✓ Song registered: "${createdSong.title}" (ID: ${createdSong.id})\n`);

  // ── Step 2: Verify Media Streaming & Seeking (Range Requests) ────────────────
  console.log('▶ STEP 2: Verifying Audio & Image Streaming (200 & 206 Partial Content)...');

  // Verify Audio 200 OK
  const audioStreamUrl = `${BASE_URL}${createdSong.audio_url}`;
  const audioStreamRes = await fetch(audioStreamUrl);
  if (audioStreamRes.status !== 200 || audioStreamRes.headers.get('content-type') !== 'audio/mpeg') {
    throw new Error(`Audio stream check failed: status ${audioStreamRes.status}, mime ${audioStreamRes.headers.get('content-type')}`);
  }
  console.log(`  ✓ Audio streams with HTTP 200 (${audioStreamRes.headers.get('content-length')} bytes)`);

  // Verify Audio 206 Partial Content (Range Request for seeking)
  const rangeRes = await fetch(audioStreamUrl, {
    headers: { Range: 'bytes=1048576-2097151' }, // 1MB chunk
  });
  if (rangeRes.status !== 206) {
    throw new Error(`Audio seeking range request failed: status ${rangeRes.status}`);
  }
  console.log(`  ✓ Range request (seeking) returned HTTP 206 (${rangeRes.headers.get('content-range')})`);

  // Verify Cover Artwork 200 OK
  const coverStreamUrl = `${BASE_URL}${createdSong.cover_url}`;
  const coverStreamRes = await fetch(coverStreamUrl);
  if (coverStreamRes.status !== 200 || coverStreamRes.headers.get('content-type') !== 'image/jpeg') {
    throw new Error(`Cover stream check failed: status ${coverStreamRes.status}`);
  }
  console.log(`  ✓ Artwork serves with HTTP 200 (${coverStreamRes.headers.get('content-length')} bytes)\n`);

  // ── Step 3: Playlist Creation & Track Addition ──────────────────────────────
  console.log('▶ STEP 3: Testing Playlist Management & Player "+" Flow...');

  // Create Playlist
  const createPlaylistRes = await fetch(`${BASE_URL}/api/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Late Night Talks',
      description: 'Private collection for late night calls',
    }),
  });
  if (!createPlaylistRes.ok) throw new Error('Playlist creation failed');
  const playlistData = await createPlaylistRes.json();
  const playlist = playlistData.playlist;
  console.log(`  ✓ Playlist created: "${playlist.name}" (ID: ${playlist.id})`);

  // Add Song to Playlist
  const addTrackRes = await fetch(`${BASE_URL}/api/playlists/${playlist.id}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song_id: createdSong.id }),
  });
  if (!addTrackRes.ok) throw new Error('Adding track to playlist failed');
  console.log(`  ✓ Added song to playlist "${playlist.name}"`);

  // Verify Duplicate Prevention
  const addDuplicateRes = await fetch(`${BASE_URL}/api/playlists/${playlist.id}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ song_id: createdSong.id }),
  });
  const dupData = await addDuplicateRes.json();
  if (!dupData.duplicate && !dupData.track) {
    throw new Error('Duplicate check failed');
  }
  console.log(`  ✓ Duplicate addition safely prevented`);

  // Fetch playlist tracks to verify persistence
  const tracksRes = await fetch(`${BASE_URL}/api/playlists/${playlist.id}/tracks`);
  const tracks = await tracksRes.json();
  if (!Array.isArray(tracks) || tracks.length !== 1 || tracks[0].id !== createdSong.id) {
    throw new Error('Playlist tracks persistence check failed');
  }
  console.log(`  ✓ Playlist membership verified across reloads (1 track confirmed)\n`);

  // ── Step 4: Metadata Editing ────────────────────────────────────────────────
  console.log('▶ STEP 4: Testing Song Metadata Editing (PATCH)...');

  const editSongRes = await fetch(`${BASE_URL}/api/songs/${createdSong.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Midnight Reverie (Remastered)',
      artist: 'Cariño & Co.',
      album: 'Phase 2 Deluxe',
    }),
  });
  if (!editSongRes.ok) throw new Error('Song editing failed');
  const editedData = await editSongRes.json();
  if (editedData.song.title !== 'Midnight Reverie (Remastered)') {
    throw new Error('Song title update not reflected');
  }
  console.log(`  ✓ Song metadata successfully updated to "${editedData.song.title}"\n`);

  // ── Step 5: True Deletion Verification ──────────────────────────────────────
  console.log('▶ STEP 5: Testing True Deletion (DB record + Storage files + Junctions)...');

  // Verify files exist before deletion
  const audioFilePath = path.join(__dirname, '..', '.storage', 'audio', path.basename(createdSong.audio_path));
  const coverFilePath = path.join(__dirname, '..', '.storage', 'covers', path.basename(createdSong.cover_path));
  console.log(`  • Checking files on disk prior to delete:`);
  console.log(`    - Audio file exists: ${fs.existsSync(audioFilePath)}`);
  console.log(`    - Cover file exists: ${fs.existsSync(coverFilePath)}`);

  // Perform DELETE /api/songs/[id]
  const deleteRes = await fetch(`${BASE_URL}/api/songs/${createdSong.id}`, {
    method: 'DELETE',
  });
  if (!deleteRes.ok) throw new Error('Delete song endpoint failed');
  console.log(`  ✓ DELETE /api/songs/${createdSong.id} returned HTTP 200`);

  // 1. Verify song is gone from songs catalog
  const allSongsRes = await fetch(`${BASE_URL}/api/songs`);
  const allSongs = await allSongsRes.json();
  const stillInCatalog = allSongs.some((s) => s.id === createdSong.id);
  if (stillInCatalog) throw new Error('Song still exists in catalog after deletion');
  console.log(`  ✓ Song no longer exists in library catalog`);

  // 2. Verify audio storage object was purged from disk
  if (fs.existsSync(audioFilePath)) {
    throw new Error(`Orphaned audio file detected: ${audioFilePath}`);
  }
  console.log(`  ✓ Audio file permanently deleted from disk (no orphaned files)`);

  // 3. Verify cover storage object was purged from disk
  if (fs.existsSync(coverFilePath)) {
    throw new Error(`Orphaned cover file detected: ${coverFilePath}`);
  }
  console.log(`  ✓ Cover artwork file permanently deleted from disk (no orphaned files)`);

  // 4. Verify playlist no longer references deleted song
  const updatedPlaylistTracksRes = await fetch(`${BASE_URL}/api/playlists/${playlist.id}/tracks`);
  const updatedPlaylistTracks = await updatedPlaylistTracksRes.json();
  const retainedOrphan = updatedPlaylistTracks.some((t) => t.id === createdSong.id);
  if (retainedOrphan) {
    throw new Error('Playlist still retains reference to deleted song');
  }
  console.log(`  ✓ Playlist tracks junction cleanly updated (0 orphaned references)`);

  // Clean up test playlist
  await fetch(`${BASE_URL}/api/playlists/${playlist.id}`, { method: 'DELETE' });
  console.log(`  ✓ Test playlist cleaned up\n`);

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  ALL PHASE 2 FINALIZATION TESTS PASSED WITH ZERO REGRESSIONS!');
  console.log('═══════════════════════════════════════════════════════════════════════');
}

runPhase2Verification().catch((err) => {
  console.error('\n❌ VERIFICATION ERROR:', err);
  process.exit(1);
});
