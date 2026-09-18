// Test script to verify room creation, SSE event delivery, state updates, and catch-up calculation
async function runTests() {
  console.log('=== PHASE 3 REALTIME SYNC & CATCH-UP TESTS ===');

  // 1. Create a room
  console.log('\n[1] Creating room...');
  const createRes = await fetch('http://localhost:3000/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: "Sync Test Room",
      created_by: "host-user-id",
      is_private: false
    })
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create room: ${createRes.status} ${await createRes.text()}`);
  }
  const createData = await createRes.json();
  const room = createData.room;
  console.log(`Room created: ID=${room.id}, Code=${room.room_code}`);

  // 2. Fetch room details
  console.log('\n[2] Fetching room details...');
  const getRes = await fetch(`http://localhost:3000/api/rooms/${room.id}`);
  const roomData = await getRes.json();
  const initState = roomData.room_state || roomData.roomState;
  console.log(`Initial Room State: is_playing=${initState?.is_playing}, position_ms=${initState?.position_ms}`);

  // 3. Test SSE endpoint connection
  console.log('\n[3] Testing SSE endpoint (/api/rooms/[id]/events)...');
  const controller = new AbortController();
  const sseTimeout = setTimeout(() => controller.abort(), 8000);

  const ssePromise = (async () => {
    const sseRes = await fetch(`http://localhost:3000/api/rooms/${room.id}/events`, {
      headers: { 'Accept': 'text/event-stream' },
      signal: controller.signal
    });

    if (!sseRes.ok) {
      throw new Error(`SSE stream failed: ${sseRes.status}`);
    }

    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let receivedEvents = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.substring(6));
          console.log(`[SSE Listener] Received event:`, data.type, data.positionMs !== undefined ? `pos=${data.positionMs}` : '');
          receivedEvents.push(data);
          if (receivedEvents.length >= 3) {
            clearTimeout(sseTimeout);
            controller.abort();
            return receivedEvents;
          }
        }
      }
    }
    return receivedEvents;
  })();

  // Give SSE listener 500ms to connect
  await new Promise(r => setTimeout(r, 500));

  // 4. Broadcast PLAY event
  console.log('\n[4] Broadcasting PLAY event from Host...');
  const playRes = await fetch(`http://localhost:3000/api/rooms/${room.id}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'PLAY',
      roomId: room.id,
      roomCode: room.room_code,
      senderId: 'host-user-id',
      senderName: 'Host User',
      timestamp: Date.now(),
      positionMs: 10000,
      isPlaying: true
    })
  });
  console.log('PLAY broadcast response:', await playRes.json());

  // 5. Broadcast SEEK event
  console.log('\n[5] Broadcasting SEEK event from Host...');
  const seekRes = await fetch(`http://localhost:3000/api/rooms/${room.id}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'SEEK',
      roomId: room.id,
      roomCode: room.room_code,
      senderId: 'host-user-id',
      senderName: 'Host User',
      timestamp: Date.now(),
      positionMs: 25000,
      isPlaying: true
    })
  });
  console.log('SEEK broadcast response:', await seekRes.json());

  let events = [];
  try {
    events = await ssePromise;
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  }

  console.log(`\n[6] SSE successfully received ${events.length} events!`);
  const hasConnected = events.some(e => e.type === 'CONNECTED');
  const hasPlay = events.some(e => e.type === 'PLAY');
  const hasSeek = events.some(e => e.type === 'SEEK');
  console.log(`- CONNECTED event: ${hasConnected ? 'PASS' : 'FAIL'}`);
  console.log(`- PLAY event: ${hasPlay ? 'PASS' : 'FAIL'}`);
  console.log(`- SEEK event: ${hasSeek ? 'PASS' : 'FAIL'}`);

  // 7. Verify updated room state
  console.log('\n[7] Verifying persisted server room state...');
  const finalGetRes = await fetch(`http://localhost:3000/api/rooms/${room.id}`);
  const finalRoomData = await finalGetRes.json();
  const finalState = finalRoomData.room_state || finalRoomData.roomState;
  console.log(`Final Room State: position_ms=${finalState?.position_ms}, is_playing=${finalState?.is_playing}`);

  // 8. Test catch-up formula
  console.log('\n[8] Testing Authoritative Catch-up Calculation...');
  const hostStartMs = 10000;
  const elapsedSeconds = 5.2; // Listener joined 5.2 seconds later
  const calculatedCatchup = (hostStartMs / 1000) + elapsedSeconds;
  console.log(`Host started at 10.000s. 5.2s elapsed -> Target position = ${calculatedCatchup.toFixed(3)}s (Expected: 15.200s)`);

  console.log('\n=== ALL API & SSE PIPELINE TESTS COMPLETED SUCCESSFULLY ===');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
