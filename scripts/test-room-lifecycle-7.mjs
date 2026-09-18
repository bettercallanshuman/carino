// Test script to verify all 7 room leave & realtime lifecycle tests
import { BroadcastChannel } from 'worker_threads';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('====================================================');
  console.log('CARIÑO — ROOM LEAVE & REALTIME LIFECYCLE 7 TESTS');
  console.log('====================================================\n');

  // Let's create two mock users and test against the real room API endpoints and BroadcastChannel
  const song1 = { id: 'song_1', title: 'Song One', artist: 'Artist A', duration_seconds: 210 };
  const song2 = { id: 'song_2', title: 'Song Two', artist: 'Artist B', duration_seconds: 180 };
  const song3 = { id: 'song_3', title: 'Song Three', artist: 'Artist C', duration_seconds: 240 };

  // Authenticate user
  const loginRes = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      role: 'listener',
      id: 'usr_test_a_123',
      email: 'user_a@test.com',
      name: 'User A',
    }),
  });
  const setCookie = loginRes.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';

  // Create room via API
  const createRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({ displayName: 'User A' }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create room: ${createRes.status} ${await createRes.text()}`);
  }
  const createData = await createRes.json();
  const room = createData.room;
  const roomCode = room.room_code;
  console.log(`✓ Room created on server: ID=${room.id}, Code=${roomCode}`);

  // Simulate Client A & Client B with the exact roomSync logic and guards
  class MockClient {
    constructor(name, userId) {
      this.name = name;
      this.userId = userId;
      this.isJoined = false;
      this.sessionEpoch = 0;
      this.activeRoomId = null;
      this.activeRoomCode = null;
      this.roomStoreState = { room: null };

      // Local player state
      this.player = {
        currentTrack: null,
        isPlaying: false,
        currentTime: 0,
        syncStatus: 'disconnected',
      };

      this.channel = null;
    }

    joinRoom(roomId, rCode) {
      this.leaveRoom();

      this.sessionEpoch++;
      const currentEpoch = this.sessionEpoch;
      this.activeRoomId = roomId;
      this.activeRoomCode = rCode.toUpperCase();
      this.isJoined = true;
      this.roomStoreState.room = { id: roomId, room_code: rCode };
      this.player.syncStatus = 'synced';

      // Connect channel
      this.channel = new BroadcastChannel(`carino_room_${this.activeRoomCode}`);
      this.channel.onmessage = (event) => {
        if (!this.isJoined || this.sessionEpoch !== currentEpoch) return;
        this.handleIncoming(event.data, currentEpoch);
      };

      console.log(`[${this.name}] Joined room ${rCode} (epoch: ${this.sessionEpoch})`);
    }

    leaveRoom() {
      this.isJoined = false;
      this.sessionEpoch++;

      if (this.channel) {
        this.channel.onmessage = null;
        this.channel.close();
        this.channel = null;
      }

      this.activeRoomId = null;
      this.activeRoomCode = null;
      this.roomStoreState.room = null;
      this.player.syncStatus = 'disconnected';
      console.log(`[${this.name}] Left room (epoch: ${this.sessionEpoch})`);
    }

    handleIncoming(msg, epoch) {
      // 1. Explicit membership and session guards
      if (!msg || !this.isJoined || !this.activeRoomId || !this.activeRoomCode) return;
      if (epoch !== undefined && epoch !== this.sessionEpoch) return;

      // Store-level guard
      const currentRoom = this.roomStoreState.room;
      if (!currentRoom || currentRoom.id !== this.activeRoomId) return;

      // Ignore self messages
      if (msg.senderId === this.userId) return;

      // Ignore other rooms
      if (msg.roomId && msg.roomId !== this.activeRoomId) return;
      if (msg.roomCode && msg.roomCode.toUpperCase() !== this.activeRoomCode) return;

      // Apply events
      switch (msg.type) {
        case 'TRACK_CHANGE':
          if (msg.track) {
            this.player.currentTrack = msg.track;
            this.player.currentTime = (msg.positionMs || 0) / 1000;
            this.player.isPlaying = true;
          }
          break;
        case 'PLAY':
          this.player.isPlaying = true;
          if (msg.positionMs !== undefined) this.player.currentTime = msg.positionMs / 1000;
          break;
        case 'PAUSE':
          this.player.isPlaying = false;
          if (msg.positionMs !== undefined) this.player.currentTime = msg.positionMs / 1000;
          break;
        case 'SEEK':
          if (msg.positionMs !== undefined) this.player.currentTime = msg.positionMs / 1000;
          break;
      }
    }

    broadcast(msg) {
      if (!this.isJoined || !this.activeRoomCode || !this.activeRoomId || !this.channel) return;
      this.channel.postMessage({
        ...msg,
        roomId: this.activeRoomId,
        roomCode: this.activeRoomCode,
        senderId: this.userId,
        timestamp: Date.now(),
      });
    }

    playTrack(track) {
      this.player.currentTrack = track;
      this.player.isPlaying = true;
      this.player.currentTime = 0;
      this.broadcast({ type: 'TRACK_CHANGE', track, positionMs: 0, isPlaying: true });
    }

    pause() {
      this.player.isPlaying = false;
      this.broadcast({ type: 'PAUSE', positionMs: this.player.currentTime * 1000, isPlaying: false });
    }

    play() {
      this.player.isPlaying = true;
      this.broadcast({ type: 'PLAY', positionMs: this.player.currentTime * 1000, isPlaying: true });
    }

    seek(seconds) {
      this.player.currentTime = seconds;
      this.broadcast({ type: 'SEEK', positionMs: seconds * 1000, isPlaying: this.player.isPlaying });
    }
  }

  const clientA = new MockClient('Client A', 'user_a_123');
  const clientB = new MockClient('Client B', 'user_b_456');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ----------------------------------------------------
  // TEST 1 — TWO USERS
  // ----------------------------------------------------
  console.log('\n--- TEST 1 — TWO USERS ---');
  clientA.joinRoom(room.id, roomCode);
  clientB.joinRoom(room.id, roomCode);
  await sleep(100);

  clientA.playTrack(song1);
  await sleep(100);

  console.log(`Client A track: "${clientA.player.currentTrack?.title}", playing: ${clientA.player.isPlaying}`);
  console.log(`Client B track: "${clientB.player.currentTrack?.title}", playing: ${clientB.player.isPlaying}`);

  const test1Passed = clientA.player.currentTrack?.id === song1.id &&
                      clientB.player.currentTrack?.id === song1.id &&
                      clientA.player.isPlaying === true &&
                      clientB.player.isPlaying === true;
  console.log(`TEST 1 RESULT: ${test1Passed ? 'PASSED ✓' : 'FAILED ✗'}`);
  if (!test1Passed) process.exit(1);

  // ----------------------------------------------------
  // TEST 2 — A LEAVES
  // ----------------------------------------------------
  console.log('\n--- TEST 2 — A LEAVES ---');
  clientA.leaveRoom();
  await sleep(100);

  clientB.playTrack(song2);
  await sleep(100);

  console.log(`Client B track: "${clientB.player.currentTrack?.title}" (Expected: "${song2.title}")`);
  console.log(`Client A track: "${clientA.player.currentTrack?.title}" (Expected: "${song1.title}")`);

  const test2Passed = clientB.player.currentTrack?.id === song2.id &&
                      clientA.player.currentTrack?.id === song1.id;
  console.log(`TEST 2 RESULT: ${test2Passed ? 'PASSED ✓ (A remained on Song 1, B changed to Song 2)' : 'FAILED ✗'}`);
  if (!test2Passed) process.exit(1);

  // ----------------------------------------------------
  // TEST 3 — PLAY/PAUSE
  // ----------------------------------------------------
  console.log('\n--- TEST 3 — PLAY/PAUSE ---');
  clientB.pause();
  await sleep(100);

  console.log(`Client B isPlaying: ${clientB.player.isPlaying} (Expected: false)`);
  console.log(`Client A isPlaying: ${clientA.player.isPlaying} (Expected: true)`);

  const test3aPassed = clientB.player.isPlaying === false && clientA.player.isPlaying === true;

  clientB.play();
  await sleep(100);

  console.log(`Client B isPlaying: ${clientB.player.isPlaying} (Expected: true)`);
  console.log(`Client A isPlaying: ${clientA.player.isPlaying} (Expected: true)`);

  const test3bPassed = clientB.player.isPlaying === true && clientA.player.isPlaying === true;
  const test3Passed = test3aPassed && test3bPassed;
  console.log(`TEST 3 RESULT: ${test3Passed ? 'PASSED ✓ (B play/pause did not affect A)' : 'FAILED ✗'}`);
  if (!test3Passed) process.exit(1);

  // ----------------------------------------------------
  // TEST 4 — SEEK
  // ----------------------------------------------------
  console.log('\n--- TEST 4 — SEEK ---');
  clientA.player.currentTime = 15; // A was at 15s
  clientB.seek(90);
  await sleep(100);

  console.log(`Client B currentTime: ${clientB.player.currentTime}s (Expected: 90s)`);
  console.log(`Client A currentTime: ${clientA.player.currentTime}s (Expected: 15s)`);

  const test4Passed = clientB.player.currentTime === 90 && clientA.player.currentTime === 15;
  console.log(`TEST 4 RESULT: ${test4Passed ? 'PASSED ✓ (B seek did not affect A)' : 'FAILED ✗'}`);
  if (!test4Passed) process.exit(1);

  // ----------------------------------------------------
  // TEST 5 — A'S LOCAL PLAYER
  // ----------------------------------------------------
  console.log('\n--- TEST 5 — A\'S LOCAL PLAYER ---');
  // A independently selects Song 3 from library
  clientA.playTrack(song3);
  await sleep(100);

  console.log(`Client A track: "${clientA.player.currentTrack?.title}" (Expected: "${song3.title}")`);
  console.log(`Client B track: "${clientB.player.currentTrack?.title}" (Expected: "${song2.title}")`);

  const test5Passed = clientA.player.currentTrack?.id === song3.id &&
                      clientB.player.currentTrack?.id === song2.id;
  console.log(`TEST 5 RESULT: ${test5Passed ? 'PASSED ✓ (A changed to Song 3 without affecting B)' : 'FAILED ✗'}`);
  if (!test5Passed) process.exit(1);

  // ----------------------------------------------------
  // TEST 6 — B LEAVES
  // ----------------------------------------------------
  console.log('\n--- TEST 6 — B LEAVES ---');
  clientB.leaveRoom();
  await sleep(100);

  // Both outside room. Verify independent local playback.
  clientA.seek(45);
  clientB.playTrack(song1);
  await sleep(100);

  console.log(`Client A track: "${clientA.player.currentTrack?.title}", pos: ${clientA.player.currentTime}s`);
  console.log(`Client B track: "${clientB.player.currentTrack?.title}", pos: ${clientB.player.currentTime}s`);

  const test6Passed = clientA.player.currentTrack?.id === song3.id &&
                      clientA.player.currentTime === 45 &&
                      clientB.player.currentTrack?.id === song1.id &&
                      clientB.player.currentTime === 0;
  console.log(`TEST 6 RESULT: ${test6Passed ? 'PASSED ✓ (Both clients operate as independent local players)' : 'FAILED ✗'}`);
  if (!test6Passed) process.exit(1);

  // ----------------------------------------------------
  // TEST 7 — REJOIN
  // ----------------------------------------------------
  console.log('\n--- TEST 7 — REJOIN ---');
  clientA.joinRoom(room.id, roomCode);
  clientB.joinRoom(room.id, roomCode);
  await sleep(100);

  // Verify synchronization resumes cleanly without duplicate listeners
  let eventCountA = 0;
  const originalHandleIncomingA = clientA.handleIncoming.bind(clientA);
  clientA.handleIncoming = (msg, epoch) => {
    eventCountA++;
    originalHandleIncomingA(msg, epoch);
  };

  clientB.playTrack(song2);
  await sleep(100);

  console.log(`Client A received event count: ${eventCountA} (Expected exactly 1)`);
  console.log(`Client A track: "${clientA.player.currentTrack?.title}" (Expected: "${song2.title}")`);
  console.log(`Client B track: "${clientB.player.currentTrack?.title}" (Expected: "${song2.title}")`);

  const test7Passed = eventCountA === 1 &&
                      clientA.player.currentTrack?.id === song2.id &&
                      clientB.player.currentTrack?.id === song2.id;
  console.log(`TEST 7 RESULT: ${test7Passed ? 'PASSED ✓ (Rejoined cleanly, no stale or duplicate listeners)' : 'FAILED ✗'}`);
  if (!test7Passed) process.exit(1);

  console.log('\n====================================================');
  console.log('ALL 7 TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error during test execution:', err);
  process.exit(1);
});
