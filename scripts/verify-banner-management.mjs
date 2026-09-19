import assert from 'assert';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function runBannerTests() {
  console.log('--- Starting CARIÑO Admin Banner Content Management HTTP Verification ---');

  // ── TEST 1: Unauthenticated request to POST /api/banners ───────────────────
  console.log('Running TEST 1: Unauthenticated request must receive 401...');
  const unauthRes = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, title: 'Unauthorized Hacker' }),
  });
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated user must be rejected with 401');
  console.log('✓ TEST 1 Passed: Unauthenticated request rejected with 401 Unauthorized');

  // ── TEST 2: Non-Admin user request to POST /api/banners ────────────────────
  console.log('Running TEST 2: Normal user (non-admin) must receive 403...');
  const userLoginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'user',
      name: 'Regular Listener',
      id: '00000000-0000-0000-0000-000000000002',
    }),
  });
  assert.strictEqual(userLoginRes.status, 200, 'dev-login for user should succeed');
  const userCookie = userLoginRes.headers.get('set-cookie')?.split(';')[0];
  assert.ok(userCookie, 'User cookie should be present');

  const normalUserRes = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: userCookie,
    },
    body: JSON.stringify({ id: 1, title: 'Should Fail' }),
  });
  assert.strictEqual(normalUserRes.status, 403, 'Normal user must be forbidden with 403');
  console.log('✓ TEST 2 Passed: Non-admin request rejected with 403 Forbidden');

  // ── TEST 3: Admin authentication & initial banners fetch ───────────────────
  console.log('Running TEST 3: Admin authentication and initial banners check...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'admin',
      name: 'Cariño Admin',
      id: '00000000-0000-0000-0000-000000000001',
    }),
  });
  assert.strictEqual(adminLoginRes.status, 200, 'dev-login for admin should succeed');
  const adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0];
  assert.ok(adminCookie, 'Admin cookie should be present');

  const adminHeaders = {
    'Content-Type': 'application/json',
    Cookie: adminCookie,
  };

  const getRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  assert.strictEqual(getRes.status, 200, 'GET /api/banners should succeed');
  const initialBanners = await getRes.json();
  assert.strictEqual(initialBanners.length, 4, 'Must return exactly 4 banners');
  assert.deepStrictEqual(initialBanners.map((b) => b.id), [1, 2, 3, 4], 'Slot IDs must be 1, 2, 3, 4');

  const b1 = initialBanners.find((b) => b.id === 1);
  assert.ok(b1, 'Banner 1 must exist');
  assert.strictEqual(b1.title, 'R&B Hits');
  assert.ok(b1.image_url, 'Banner 1 must have an image_url');
  const originalImageUrl = b1.image_url;
  const originalSubtitle = b1.subtitle;
  const originalCategory = b1.category;
  const originalStats = b1.stats;
  console.log('✓ TEST 3 Passed: Admin authenticated and verified 4 existing banner slots with intact artwork');

  // ── TEST 4: Admin edits Title of Banner 1 ──────────────────────────────────
  console.log('Running TEST 4: Edit Title of Banner 1 to "Late Night Drive"...');
  const editTitleRes = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 1,
      title: 'Late Night Drive',
    }),
  });
  assert.strictEqual(editTitleRes.status, 200, 'POST /api/banners should succeed for admin');
  const editTitleData = await editTitleRes.json();
  assert.strictEqual(editTitleData.banner.title, 'Late Night Drive');

  // Verify persistence via GET
  const verifyTitleRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  const verifyTitleList = await verifyTitleRes.json();
  const v1 = verifyTitleList.find((b) => b.id === 1);
  assert.strictEqual(v1.title, 'Late Night Drive', 'Title must persist');
  assert.strictEqual(v1.image_url, originalImageUrl, 'Image URL must be preserved when editing title');
  assert.strictEqual(v1.subtitle, originalSubtitle, 'Subtitle must be preserved');
  console.log('✓ TEST 4 Passed: Banner title successfully updated and persisted while preserving artwork');

  // ── TEST 5: Admin edits Subtitle/Description of Banner 1 ───────────────────
  console.log('Running TEST 5: Edit Description of Banner 1...');
  const newDesc = 'Slow melodies for long roads and longer conversations.';
  const editDescRes = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 1,
      subtitle: newDesc,
    }),
  });
  assert.strictEqual(editDescRes.status, 200);

  const verifyDescRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  const verifyDescList = await verifyDescRes.json();
  const v1Desc = verifyDescList.find((b) => b.id === 1);
  assert.strictEqual(v1Desc.subtitle, newDesc, 'Description must persist');
  assert.strictEqual(v1Desc.title, 'Late Night Drive', 'Title must remain Late Night Drive');
  console.log('✓ TEST 5 Passed: Banner description successfully updated and persisted');

  // ── TEST 6: Admin edits Stats of Banner 1 ──────────────────────────────────
  console.log('Running TEST 6: Edit Stats of Banner 1...');
  const newStats = '12 Tracks • 47 min';
  const editStatsRes = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 1,
      stats: newStats,
    }),
  });
  assert.strictEqual(editStatsRes.status, 200);

  const verifyStatsRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  const verifyStatsList = await verifyStatsRes.json();
  const v1Stats = verifyStatsList.find((b) => b.id === 1);
  assert.strictEqual(v1Stats.stats, newStats, 'Stats must persist');
  console.log('✓ TEST 6 Passed: Banner stats successfully updated and persisted');

  // ── TEST 7: Empty Optional Stats Field ─────────────────────────────────────
  console.log('Running TEST 7: Clear optional stats field (empty string)...');
  const clearStatsRes = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 1,
      stats: '',
    }),
  });
  assert.strictEqual(clearStatsRes.status, 200);

  const verifyClearRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  const verifyClearList = await verifyClearRes.json();
  const v1Clear = verifyClearList.find((b) => b.id === 1);
  assert.strictEqual(v1Clear.stats, '', 'Stats must persist as empty string');
  assert.strictEqual(Boolean(v1Clear.stats?.trim()), false, 'Dynamic condition must evaluate false');
  console.log('✓ TEST 7 Passed: Stats cleared to empty string, omitted from render without placeholder');

  // ── TEST 8: Independent Slot Integrity (Slot 2 edit does not mutate Slot 1)
  console.log('Running TEST 8: Verify independent slot integrity (Slot 2 vs Slot 1)...');
  const b2Original = initialBanners.find((b) => b.id === 2);
  const editB2Res = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 2,
      title: 'Neon Horizon',
      stats: '88,000 Plays',
    }),
  });
  assert.strictEqual(editB2Res.status, 200);

  const verifySlotRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  const verifySlotList = await verifySlotRes.json();
  const v1Check = verifySlotList.find((b) => b.id === 1);
  const v2Check = verifySlotList.find((b) => b.id === 2);

  assert.strictEqual(v2Check.title, 'Neon Horizon', 'Slot 2 title updated');
  assert.strictEqual(v2Check.stats, '88,000 Plays', 'Slot 2 stats updated');
  assert.strictEqual(v1Check.title, 'Late Night Drive', 'Slot 1 title must NOT be mutated by Slot 2 edit');
  console.log('✓ TEST 8 Passed: Slots 1 and 2 operate completely independently');

  // ── TEST 9: Combined Edit (title + category + subtitle + stats) ─────────────
  console.log('Running TEST 9: Combined multi-field edit...');
  const combinedRes = await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 1,
      title: 'Sunset Melodies',
      category: 'EXCLUSIVE MIX',
      subtitle: 'A golden hour experience curated for two.',
      stats: '99,999 Likes • 15 Songs',
    }),
  });
  assert.strictEqual(combinedRes.status, 200);

  const verifyCombRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  const verifyCombList = await verifyCombRes.json();
  const v1Comb = verifyCombList.find((b) => b.id === 1);

  assert.strictEqual(v1Comb.title, 'Sunset Melodies');
  assert.strictEqual(v1Comb.category, 'EXCLUSIVE MIX');
  assert.strictEqual(v1Comb.subtitle, 'A golden hour experience curated for two.');
  assert.strictEqual(v1Comb.stats, '99,999 Likes • 15 Songs');
  assert.strictEqual(v1Comb.image_url, originalImageUrl, 'Image URL preserved across combined text edit');
  console.log('✓ TEST 9 Passed: Combined multi-field edit persisted with intact image_url');

  // ── TEST 10: Restore Original Values for Clean Repo State ──────────────────
  console.log('Running TEST 10: Restoring original curated values for clean state...');
  await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 1,
      title: 'R&B Hits',
      category: originalCategory || 'CURATED PLAYLIST',
      subtitle: originalSubtitle,
      stats: originalStats || '50,056 Likes • 213 Songs, 13 hr 7 min',
    }),
  });

  await fetch(`${BASE_URL}/api/banners`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: 2,
      title: b2Original.title,
      category: b2Original.category,
      subtitle: b2Original.subtitle,
      stats: b2Original.stats || '34,210 Likes • 140 Songs, 8 hr 12 min',
    }),
  });

  const finalCheckRes = await fetch(`${BASE_URL}/api/banners`, { headers: adminHeaders });
  const finalBanners = await finalCheckRes.json();
  assert.strictEqual(finalBanners[0].title, 'R&B Hits');
  assert.strictEqual(finalBanners[0].image_url, originalImageUrl);
  assert.strictEqual(finalBanners[0].stats, '50,056 Likes • 213 Songs, 13 hr 7 min');
  assert.strictEqual(finalBanners[1].title, b2Original.title);
  console.log('✓ TEST 10 Passed: Original values restored; clean and pristine repository state verified');

  console.log('--- ALL 10 BANNER MANAGEMENT HTTP TESTS PASSED SUCCESSFULLY ---');
}

runBannerTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
