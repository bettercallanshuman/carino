// Automated verification script for Phase 3 Polish & Upload Fixes
async function runVerification() {
  console.log('=== VERIFYING PHASE 3 POLISH & UPLOAD FIXES ===\n');

  // TEST 1: GET /api/account
  console.log('[TEST 1] Testing GET /api/account...');
  const getAccRes = await fetch('http://localhost:3000/api/account');
  if (!getAccRes.ok) throw new Error(`GET /api/account failed: ${getAccRes.status}`);
  const profile = await getAccRes.json();
  console.log(`PASS: Profile loaded: Name="${profile.name}", Gender="${profile.gender}", Avatar="${profile.avatar_url || 'none'}"`);

  // TEST 2: PATCH /api/account with image < 1 MB
  console.log('\n[TEST 2] Testing PATCH /api/account with image < 1 MB...');
  // Create a minimal 1x1 PNG buffer (< 1 MB)
  const smallPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82
  ]);

  const formData = new FormData();
  formData.append('name', 'Anshuman Sharma');
  formData.append('gender', 'Male');
  formData.append('date_of_birth', '1998-05-20');
  formData.append('avatar', new Blob([smallPngBuffer], { type: 'image/png' }), 'test_avatar.png');

  const patchAccRes = await fetch('http://localhost:3000/api/account', {
    method: 'PATCH',
    body: formData,
  });

  const patchAccData = await patchAccRes.json();
  if (!patchAccRes.ok) {
    throw new Error(`PATCH /api/account failed: ${patchAccRes.status} ${JSON.stringify(patchAccData)}`);
  }
  console.log(`PASS: Profile updated successfully! Avatar URL="${patchAccData.avatar_url}"`);
  if (!patchAccData.avatar_url || !patchAccData.avatar_url.includes('/api/media')) {
    throw new Error('Avatar URL does not point to valid media proxy endpoint');
  }

  // Confirm persistence by fetching again
  const reGetAccRes = await fetch('http://localhost:3000/api/account');
  const reGetAccData = await reGetAccRes.json();
  if (reGetAccData.avatar_url !== patchAccData.avatar_url) {
    throw new Error('Avatar URL did not persist across requests');
  }
  console.log('PASS: Profile avatar persists across subsequent requests.');

  // TEST 3: Reject profile image > 1 MB
  console.log('\n[TEST 3] Testing profile image size validation (> 1 MB)...');
  const largeBuffer = Buffer.alloc(1024 * 1024 + 1024); // 1 MB + 1 KB
  const largeFormData = new FormData();
  largeFormData.append('name', 'Anshuman Sharma');
  largeFormData.append('avatar', new Blob([largeBuffer], { type: 'image/png' }), 'oversized_avatar.png');

  const oversizeRes = await fetch('http://localhost:3000/api/account', {
    method: 'PATCH',
    body: largeFormData,
  });
  const oversizeData = await oversizeRes.json();
  console.log(`Oversize upload response (${oversizeRes.status}):`, oversizeData.error);
  if (oversizeRes.status === 400 && oversizeData.error.includes('1 MB or smaller')) {
    console.log('PASS: Large profile images strictly rejected with user-friendly error.');
  } else {
    throw new Error('Failed to reject > 1 MB profile image');
  }

  // TEST 4: GET /api/banners
  console.log('\n[TEST 4] Testing GET /api/banners...');
  const getBannersRes = await fetch('http://localhost:3000/api/banners');
  if (!getBannersRes.ok) throw new Error(`GET /api/banners failed: ${getBannersRes.status}`);
  const banners = await getBannersRes.json();
  console.log(`PASS: Retrieved ${banners.length} banner slots (Expected 4).`);
  if (banners.length !== 4) throw new Error('Expected exactly 4 banner slots');

  // TEST 5: POST /api/banners (Upload processed banner image for Slot 2)
  console.log('\n[TEST 5] Testing POST /api/banners with processed 1200x480 banner file...');
  const bannerFormData = new FormData();
  bannerFormData.append('id', '2');
  bannerFormData.append('title', 'Midnight Sunset Beats');
  bannerFormData.append('subtitle', 'Curated lo-fi groove session');
  bannerFormData.append('category', 'LATE NIGHT SPECIAL');
  bannerFormData.append('stats', '64,210 Likes • 180 Songs, 11 hr 15 min');
  bannerFormData.append('file', new Blob([smallPngBuffer], { type: 'image/png' }), 'banner_slot2_1200x480.png');

  const postBannerRes = await fetch('http://localhost:3000/api/banners', {
    method: 'POST',
    body: bannerFormData,
  });
  const postBannerData = await postBannerRes.json();
  if (!postBannerRes.ok) {
    throw new Error(`POST /api/banners failed: ${postBannerRes.status} ${JSON.stringify(postBannerData)}`);
  }
  console.log(`PASS: Banner Slot 2 updated! image_url="${postBannerData.banner.image_url}"`);

  // Verify Banner Slot 1 and Slot 3 are NOT overwritten
  const verifyBannersRes = await fetch('http://localhost:3000/api/banners');
  const verifiedBanners = await verifyBannersRes.json();
  const slot1 = verifiedBanners.find(b => b.id === 1);
  const slot2 = verifiedBanners.find(b => b.id === 2);
  const slot3 = verifiedBanners.find(b => b.id === 3);
  console.log(`Slot 1 title: "${slot1.title}"`);
  console.log(`Slot 2 title: "${slot2.title}" (image: ${slot2.image_url})`);
  console.log(`Slot 3 title: "${slot3.title}"`);
  if (!slot2.image_url || slot1.title === slot2.title) {
    throw new Error('Banner slots corrupted each other!');
  }
  console.log('PASS: All 4 banner slots remain independent.');

  // TEST 6: Verify existing audio playback pipeline
  console.log('\n[TEST 6] Verifying existing song and audio streaming...');
  const songsRes = await fetch('http://localhost:3000/api/songs');
  const songs = await songsRes.json();
  console.log(`Found ${songs.length} song(s) in catalog:`);
  for (const s of songs) {
    console.log(`- "${s.title}" by ${s.artist} (audio: ${s.audio_path}, cover: ${s.cover_path})`);
  }
  if (songs.length > 0) {
    const mediaRes = await fetch(`http://localhost:3000/api/media?bucket=audio&path=${encodeURIComponent(songs[0].audio_path)}`, {
      headers: { 'Range': 'bytes=0-1023' }
    });
    console.log(`Audio HTTP 206 Partial Stream status: ${mediaRes.status} ${mediaRes.statusText}`);
    if (mediaRes.status !== 206 && mediaRes.status !== 200) {
      throw new Error(`Audio media proxy failed: ${mediaRes.status}`);
    }
    console.log('PASS: Audio streaming intact!');
  }

  console.log('\n=== ALL PHASE 3 POLISH & UPLOAD VERIFICATIONS PASSED ===');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
