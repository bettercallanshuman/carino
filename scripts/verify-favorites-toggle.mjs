import assert from 'assert';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function runTests() {
  console.log('--- Starting CARIÑO Favourites Toggle Verification ---');

  // 1. Authenticate with dev-login
  const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user', name: 'Test Listener', id: '00000000-0000-0000-0000-000000000002' }),
  });
  assert.strictEqual(loginRes.status, 200, 'dev-login should succeed');
  const setCookie = loginRes.headers.get('set-cookie');
  assert.ok(setCookie, 'Should set session cookie');
  const cookieHeader = setCookie.split(';')[0];

  const headers = {
    'Cookie': cookieHeader,
    'Content-Type': 'application/json',
  };

  const testTrackId = 'track-toggle-test-123';

  // Cleanup if already present
  await fetch(`${BASE_URL}/api/favorites`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ songId: testTrackId }),
  });

  // Test A: Initial state
  const initRes = await fetch(`${BASE_URL}/api/favorites`, { headers });
  assert.strictEqual(initRes.status, 200);
  const initData = await initRes.json();
  assert.ok(Array.isArray(initData.songIds), 'songIds should be array');
  assert.ok(!initData.songIds.includes(testTrackId), 'test track should not be in favorites initially');
  console.log('✓ Initial state confirmed: track is unliked');

  // Test B: Toggle to liked (POST)
  const addRes = await fetch(`${BASE_URL}/api/favorites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ songId: testTrackId }),
  });
  assert.strictEqual(addRes.status, 200);
  const addData = await addRes.json();
  assert.strictEqual(addData.isFavorited, true, 'isFavorited should be true');
  assert.ok(addData.songIds.includes(testTrackId), 'test track should be in songIds');

  // Verify persistence (GET)
  const getAfterAdd = await fetch(`${BASE_URL}/api/favorites`, { headers });
  const getAfterAddData = await getAfterAdd.json();
  assert.ok(getAfterAddData.songIds.includes(testTrackId), 'test track should persist across GET');
  console.log('✓ TEST 1 passed: Track toggled to liked and persisted');

  // Test C: Toggle to unliked (POST again)
  const toggleOffRes = await fetch(`${BASE_URL}/api/favorites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ songId: testTrackId }),
  });
  assert.strictEqual(toggleOffRes.status, 200);
  const toggleOffData = await toggleOffRes.json();
  assert.strictEqual(toggleOffData.isFavorited, false, 'isFavorited should be false after toggle off');
  assert.ok(!toggleOffData.songIds.includes(testTrackId), 'test track should be removed');

  // Verify persistence of removal (GET)
  const getAfterRemove = await fetch(`${BASE_URL}/api/favorites`, { headers });
  const getAfterRemoveData = await getAfterRemove.json();
  assert.ok(!getAfterRemoveData.songIds.includes(testTrackId), 'test track absence should persist across GET');
  console.log('✓ TEST 2 passed: Track toggled to unliked and persisted');

  // Test D: DELETE endpoint verification
  // Add first
  await fetch(`${BASE_URL}/api/favorites`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ songId: testTrackId }),
  });
  // Now delete
  const delRes = await fetch(`${BASE_URL}/api/favorites`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ songId: testTrackId }),
  });
  assert.strictEqual(delRes.status, 200);
  const delData = await delRes.json();
  assert.strictEqual(delData.isFavorited, false);
  assert.ok(!delData.songIds.includes(testTrackId));
  console.log('✓ Explicit DELETE endpoint verified');

  // Test E: Rapid clicking / spam prevention & uniqueness
  console.log('Testing rapid multiple actions...');
  const spamTrackId = 'spam-test-456';
  // Clean up
  await fetch(`${BASE_URL}/api/favorites`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ songId: spamTrackId }),
  });

  // Run 6 sequential toggles
  for (let i = 0; i < 6; i++) {
    await fetch(`${BASE_URL}/api/favorites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ songId: spamTrackId }),
    });
  }

  const finalCheck = await fetch(`${BASE_URL}/api/favorites`, { headers });
  const finalCheckData = await finalCheck.json();
  const countInList = finalCheckData.songIds.filter((id) => id === spamTrackId).length;
  // Since 6 is even, starting from unliked, final state must be unliked (0 occurrences)
  assert.strictEqual(countInList, 0, `Expected 0 occurrences after 6 toggles, got ${countInList}`);

  // Test 7 toggles (odd): final state must be exactly 1 occurrence (no duplicates)
  for (let i = 0; i < 7; i++) {
    await fetch(`${BASE_URL}/api/favorites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ songId: spamTrackId }),
    });
  }
  const oddCheck = await fetch(`${BASE_URL}/api/favorites`, { headers });
  const oddCheckData = await oddCheck.json();
  const countOdd = oddCheckData.songIds.filter((id) => id === spamTrackId).length;
  assert.strictEqual(countOdd, 1, `Expected exactly 1 occurrence after 7 toggles, got ${countOdd}`);

  // Cleanup
  await fetch(`${BASE_URL}/api/favorites`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ songId: spamTrackId }),
  });

  console.log('✓ TEST 9 passed: Rapid toggling causes no duplicate favourites, no inconsistent state, and no corruption');
  console.log('--- ALL FAVORITES TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
