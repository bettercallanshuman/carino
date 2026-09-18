// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Phase 3 End-to-End Room & Realtime Synchronization Verification
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function run() {
  console.log('=== CARIÑO PHASE 3 RUNTIME VERIFICATION ===\n');

  // ── TEST 1: Create a Room ──────────────────────────────────────────────────
  console.log('TEST 1: Room Creation (POST /api/rooms)');
  const hostUserId = `host_${Date.now()}`;
  const createRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostUserId,
      displayName: 'Anshuman (Host)',
    }),
  });

  assert(createRes.status === 201, `Status is 201 Created (got ${createRes.status})`);
  const createData = await createRes.json();
  const room = createData.room;
  const members = createData.members;
  const roomState = createData.room_state;

  assert(Boolean(room && room.id), `Room has valid UUID: ${room?.id}`);
  assert(Boolean(room && room.room_code && room.room_code.length === 6), `Room code is 6 characters: ${room?.room_code}`);
  assert(room?.host_user_id === hostUserId, `Host user ID matches: ${room?.host_user_id}`);
  assert(Array.isArray(members) && members.length === 1, `Members contains 1 host member`);
  assert(members[0]?.display_name === 'Anshuman (Host)', `Host display name matches`);
  assert(roomState?.state_version === 1, `Initial state version is 1`);
  assert(roomState?.is_playing === false, `Initial is_playing is false`);
  assert(roomState?.position_ms === 0, `Initial position_ms is 0`);

  // ── TEST 2: Lookup Room by Code ────────────────────────────────────────────
  console.log('\nTEST 2: Room Lookup by Code (GET /api/rooms?code=...)');
  const lookupRes = await fetch(`${BASE_URL}/api/rooms?code=${room.room_code}`);
  assert(lookupRes.status === 200, `Lookup status is 200 (got ${lookupRes.status})`);
  const lookupData = await lookupRes.json();
  assert(lookupData.room?.id === room.id, `Resolved room ID matches created room`);
  assert(lookupData.room_state?.room_id === room.id, `Room state attached to response`);

  // Case-insensitivity check
  const lowerRes = await fetch(`${BASE_URL}/api/rooms?code=${room.room_code.toLowerCase()}`);
  assert(lowerRes.status === 200, `Lookup is case-insensitive (lowercase code resolved)`);

  // ── TEST 3: Join Room as Partner ───────────────────────────────────────────
  console.log('\nTEST 3: Join Room (POST /api/rooms/[id]/members)');
  const partnerUserId = `partner_${Date.now()}`;
  const joinRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: partnerUserId,
      displayName: 'Partner Listener',
    }),
  });

  assert(joinRes.status === 201, `Join status is 201 (got ${joinRes.status})`);
  const joinData = await joinRes.json();
  assert(Array.isArray(joinData.members) && joinData.members.length === 2, `Room members now contains 2 participants`);

  // List members
  const listMembersRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/members`);
  const listMembers = await listMembersRes.json();
  assert(listMembers.length === 2, `GET members returns 2 active participants`);
  assert(listMembers.some((m) => m.user_id === partnerUserId), `Partner member present in member list`);

  // ── TEST 4: Playback State Synchronization ─────────────────────────────────
  console.log('\nTEST 4: State Synchronization (PATCH & GET /api/rooms/[id]/state)');
  const patchRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      is_playing: true,
      position_ms: 18500,
      current_song_id: 'song-test-phase3',
      queue_index: 0,
    }),
  });

  assert(patchRes.status === 200, `PATCH state status is 200 (got ${patchRes.status})`);
  const patchedState = await patchRes.json();
  assert(patchedState.is_playing === true, `State updated is_playing: true`);
  assert(patchedState.position_ms === 18500, `State updated position_ms: 18500`);
  assert(patchedState.current_song_id === 'song-test-phase3', `State updated current_song_id`);
  assert(patchedState.state_version >= 2, `State version incremented: ${patchedState.state_version}`);

  const getStateRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/state`);
  const fetchedState = await getStateRes.json();
  assert(fetchedState.position_ms === 18500, `GET state returns persisted position_ms`);
  assert(fetchedState.is_playing === true, `GET state returns persisted is_playing`);

  // ── TEST 5: Leave Room ─────────────────────────────────────────────────────
  console.log('\nTEST 5: Leave Room (DELETE /api/rooms/[id]/members)');
  const leaveRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/members?userId=${partnerUserId}`, {
    method: 'DELETE',
  });
  assert(leaveRes.status === 200, `Leave status is 200 (got ${leaveRes.status})`);
  const leaveData = await leaveRes.json();
  assert(Array.isArray(leaveData.members) && leaveData.members.length === 1, `Remaining members is 1 (host only)`);

  // ── TEST 6: Room Pages HTML Rendering ──────────────────────────────────────
  console.log('\nTEST 6: Room Pages HTML Rendering');
  const lobbyHtmlRes = await fetch(`${BASE_URL}/room`);
  assert(lobbyHtmlRes.status === 200, `GET /room returns 200 OK`);
  const lobbyText = await lobbyHtmlRes.text();
  assert(lobbyText.includes('Room') || lobbyText.includes('Listening'), `Lobby HTML renders expected content`);

  const roomHtmlRes = await fetch(`${BASE_URL}/room/${room.room_code}`);
  assert(roomHtmlRes.status === 200, `GET /room/${room.room_code} returns 200 OK`);

  // ── TEST 7: Zero Regression on Audio Pipeline ──────────────────────────────
  console.log('\nTEST 7: Audio Pipeline Integrity Check');
  const songsRes = await fetch(`${BASE_URL}/api/songs`);
  assert(songsRes.status === 200, `GET /api/songs returns 200 OK`);
  const songs = await songsRes.json();
  assert(Array.isArray(songs) && songs.length > 0, `Catalog contains uploaded songs (${songs.length})`);

  if (songs.length > 0) {
    const testSong = songs[0];
    const audioUrl = testSong.audio_url?.startsWith('http') ? testSong.audio_url : `${BASE_URL}${testSong.audio_url}`;
    const coverUrl = testSong.cover_url?.startsWith('http') ? testSong.cover_url : `${BASE_URL}${testSong.cover_url}`;

    const audioRes = await fetch(audioUrl, { headers: { Range: 'bytes=0-1023' } });
    assert(audioRes.status === 200 || audioRes.status === 206, `Audio streaming returns ${audioRes.status} Partial/Full Content`);

    const coverRes = await fetch(coverUrl);
    assert(coverRes.status === 200, `Cover art returns 200 OK with Content-Type: ${coverRes.headers.get('content-type')}`);
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log('\n===========================================');
  console.log(`TOTAL CHECKS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('===========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
