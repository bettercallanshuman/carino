import assert from 'assert';
import { usePlayerStore } from '../stores/playerStore.ts';

function createMockSong(id, title) {
  return {
    id,
    title,
    artist: 'Artist ' + id,
    album: 'Album ' + id,
    duration_seconds: 200,
    audio_path: 'audio/' + id + '.mp3',
    cover_path: 'covers/' + id + '.jpg',
  };
}

async function runPlaybackTests() {
  console.log('--- Starting CARIÑO Playback Loop & Boundary Verification ---');

  const eightTracks = Array.from({ length: 8 }, (_, i) =>
    createMockSong(`song-${i + 1}`, `Song ${i + 1}`)
  );

  // ── TEST 1: Normal 8-track continuous order with default repeatMode ('off') ──
  console.log("Running TEST 1: Normal order 1 -> 8 -> 1 with default repeatMode ('off')...");
  usePlayerStore.getState().reset();
  usePlayerStore.getState().setQueue(eightTracks, 0);
  assert.strictEqual(usePlayerStore.getState().repeatMode, 'off', 'Default mode must be off');

  // Verify starting at track 1
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-1');

  // Advance 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8
  for (let i = 1; i < 8; i++) {
    usePlayerStore.getState().goToNext();
    assert.strictEqual(usePlayerStore.getState().queueIndex, i);
    assert.strictEqual(usePlayerStore.getState().currentTrack.id, `song-${i + 1}`);
  }
  // At track 8 (index 7): Next MUST wrap to track 1 (index 0) even with repeatMode = 'off'
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0, 'Should wrap to index 0 on normal autoplay');
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-1', 'Should be song-1');
  console.log('✓ TEST 1 Passed: 8 tracks wrap 8 -> 1 cleanly on normal autoplay (repeat off)');

  // ── TEST 2: Start from middle (track 6) ───────────────────────────────────
  console.log('Running TEST 2: Start from middle (track 6)...');
  usePlayerStore.getState().setQueue(eightTracks, 5); // index 5 is song 6
  assert.strictEqual(usePlayerStore.getState().queueIndex, 5);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-6');

  // 6 -> 7
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 6);
  // 7 -> 8
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 7);
  // 8 -> 1
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-1');
  console.log('✓ TEST 2 Passed: Starting from track 6 wraps 8 -> 1');

  // ── TEST 3: Start at last (track 8) ───────────────────────────────────────
  console.log('Running TEST 3: Start at last (track 8)...');
  usePlayerStore.getState().setQueue(eightTracks, 7);
  assert.strictEqual(usePlayerStore.getState().queueIndex, 7);
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-1');
  console.log('✓ TEST 3 Passed: 8 -> 1 wrap from initial last track');

  // ── TEST 4: Single track queue ───────────────────────────────────────────
  console.log('Running TEST 4: Single track queue...');
  const singleTrack = [createMockSong('solo-1', 'Solo Track')];
  usePlayerStore.getState().setQueue(singleTrack, 0);
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0);
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'solo-1');
  assert.strictEqual(usePlayerStore.getState().seekTarget, 0, 'Seek target should be 0 to restart audio');
  console.log('✓ TEST 4 Passed: 1 -> 1 -> 1 without crash or out-of-bounds');

  // ── TEST 5: Manual Previous wrapping ─────────────────────────────────────
  console.log('Running TEST 5: Manual Previous wrapping at index 0...');
  usePlayerStore.getState().setQueue(eightTracks, 0);
  usePlayerStore.getState().goToPrevious();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 7, 'Should wrap 1 -> 8 on Previous');
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-8');
  console.log('✓ TEST 5 Passed: Previous wraps 1 -> 8 consistently');

  // ── TEST 6: Repeat ONCE cycling and mode ─────────────────────────────────
  console.log('Running TEST 6: Repeat ONCE cycling and mode...');
  usePlayerStore.getState().setRepeatMode('off');
  usePlayerStore.getState().cycleRepeatMode();
  assert.strictEqual(usePlayerStore.getState().repeatMode, 'once', 'Cycle 1: off -> once');
  usePlayerStore.getState().cycleRepeatMode();
  assert.strictEqual(usePlayerStore.getState().repeatMode, 'infinite', 'Cycle 2: once -> infinite');
  usePlayerStore.getState().cycleRepeatMode();
  assert.strictEqual(usePlayerStore.getState().repeatMode, 'off', 'Cycle 3: infinite -> off');
  console.log('✓ TEST 6 Passed: Repeat cycle states preserved (off -> once -> infinite)');

  // ── TEST 7: Dynamic queue length (100 tracks) ─────────────────────────────
  console.log('Running TEST 7: Dynamic queue length (100 tracks)...');
  const hundredTracks = Array.from({ length: 100 }, (_, i) =>
    createMockSong(`song-${i + 1}`, `Song ${i + 1}`)
  );
  usePlayerStore.getState().setQueue(hundredTracks, 98); // Track 99 (index 98)

  // 99 -> 100
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 99);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-100');

  // 100 -> 1
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-1');

  // 1 -> 100 on Previous
  usePlayerStore.getState().goToPrevious();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 99);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-100');
  console.log('✓ TEST 7 Passed: Dynamic queue length (100 tracks) wraps 100 -> 1 and 1 -> 100');

  // ── TEST 8: Arbitrary queue length (237 tracks) ───────────────────────────
  console.log('Running TEST 8: Arbitrary queue length (237 tracks)...');
  const customTracks = Array.from({ length: 237 }, (_, i) =>
    createMockSong(`song-${i + 1}`, `Song ${i + 1}`)
  );
  usePlayerStore.getState().setQueue(customTracks, 235); // Track 236 (index 235)

  // 236 -> 237
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 236);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-237');

  // 237 -> 1
  usePlayerStore.getState().goToNext();
  assert.strictEqual(usePlayerStore.getState().queueIndex, 0);
  assert.strictEqual(usePlayerStore.getState().currentTrack.id, 'song-1');
  console.log('✓ TEST 8 Passed: Arbitrary queue length (237 tracks) wraps 237 -> 1');

  console.log('--- ALL PLAYBACK TESTS PASSED ---');
}

runPlaybackTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
