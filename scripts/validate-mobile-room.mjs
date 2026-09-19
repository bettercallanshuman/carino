import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const VIEWPORTS = [
  { name: '412', width: 412, height: 924 },
  { name: '390', width: 390, height: 844 },
  { name: '375', width: 375, height: 812 },
];

async function devLogin(name, role = 'user') {
  const res = await fetch(`${BASE_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, name }),
  });
  if (!res.ok) throw new Error(`Login failed for ${name}: ${res.status}`);
  const setCookie = res.headers.get('set-cookie');
  const cookieVal = setCookie ? setCookie.split(';')[0].split('=')[1] : '';
  const data = await res.json();
  return { user: data.user, cookieVal, cookieHeader: `carino_dev_session=${cookieVal}` };
}

async function main() {
  console.log('================================================================');
  console.log('  CARIÑO — PARTY ROOM RESPONSIVE LAYOUT & SYNC VALIDATION');
  console.log('================================================================\n');

  // 1. Authenticate Creator (Host) and Participant
  console.log('[1/5] Authenticating Creator (User A) and Participant (User B)...');
  const userA = await devLogin('Anshuman (Host)', 'admin');
  const userB = await devLogin('Priya (Listener)', 'user');
  console.log(`✓ User A: ${userA.user.name} (${userA.user.id})`);
  console.log(`✓ User B: ${userB.user.name} (${userB.user.id})`);

  // 2. Creator creates room
  console.log('\n[2/5] Creating Room via API...');
  const createRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: userA.cookieHeader,
    },
    body: JSON.stringify({ displayName: 'Anshuman (Host)' }),
  });
  if (!createRes.ok) throw new Error(`Failed to create room: ${createRes.status}`);
  const createData = await createRes.json();
  const room = createData.room;
  const roomCode = room.room_code;
  console.log(`✓ Room Created: Code = ${roomCode}, ID = ${room.id}`);

  // 3. Participant joins room
  console.log('\n[3/5] User B joining Room...');
  const joinRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: userB.cookieHeader,
    },
    body: JSON.stringify({ displayName: 'Priya (Listener)' }),
  });
  if (!joinRes.ok) throw new Error(`Failed to join room: ${joinRes.status}`);
  console.log(`✓ User B successfully joined room ${roomCode}`);

  // 4. Queue a track in the room so Now Playing hero displays live track artwork & title
  const songsRes = await fetch(`${BASE_URL}/api/songs`, {
    headers: { Cookie: userA.cookieHeader },
  });
  const songs = await songsRes.json();
  const activeSong = songs[0] || {
    id: 'demo_track_1',
    title: 'Besos en Guerra',
    artist: 'Morat, Juanes',
    album: 'Balas Perdidas',
    duration_seconds: 231,
  };
  console.log(`✓ Active Track for Room: "${activeSong.title}" by ${activeSong.artist}`);

  const patchRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/state`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: userA.cookieHeader,
    },
    body: JSON.stringify({
      current_song_id: activeSong.id,
      queue_index: 0,
      is_playing: true,
      position_ms: 12400,
    }),
  });
  const patchData = await patchRes.json();
  console.log(`✓ Room playback state updated via PATCH: is_playing=${patchData.is_playing}, position_ms=${patchData.position_ms}`);

  // Ensure artifacts dir exists
  const outDir = path.resolve('public', 'qa-artifacts');
  fs.mkdirSync(outDir, { recursive: true });

  // 5. Launch Chrome CDP for viewport testing
  console.log('\n[4/5] Launching Chrome CDP for Multi-Viewport Testing...');
  const port = 9223;
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=C:\\Users\\iaman\\carino\\.chrome-qa-temp',
    '--no-first-run',
    '--no-default-browser-check',
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const newTabRes = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
    const tabData = await newTabRes.json();
    const ws = new WebSocket(tabData.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.onopen = resolve);

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Network.enable');
    await send('Page.enable');

    const testUserConfigs = [
      { roleName: 'creator', label: 'Room Creator (Host)', cookie: userA.cookieVal },
      { roleName: 'participant', label: 'Room Participant (Listener)', cookie: userB.cookieVal },
    ];

    const measurementsReport = [];

    for (const userConfig of testUserConfigs) {
      console.log(`\n--- Testing ${userConfig.label} ---`);

      // Set session cookie
      await send('Network.setCookie', {
        name: 'carino_dev_session',
        value: userConfig.cookie,
        domain: 'localhost',
        path: '/',
      });

      for (const vp of VIEWPORTS) {
        // Set viewport metrics
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: true,
        });

        // Navigate to room page
        await send('Page.navigate', { url: `${BASE_URL}/room/${roomCode}` });

        // Wait for connection to finish
        for (let i = 0; i < 25; i++) {
          await new Promise((r) => setTimeout(r, 400));
          const checkRes = await send('Runtime.evaluate', {
            expression: `!document.body.innerText.includes('Connecting to Room') && document.body.innerText.includes('${roomCode}')`,
            returnByValue: true,
          });
          if (checkRes.result?.value) break;
        }

        await new Promise((r) => setTimeout(r, 800));

        // Evaluate layout metrics
        const metricsRes = await send('Runtime.evaluate', {
          expression: `(() => {
            const scrollContainer = document.querySelector('.room-scroll-container') || document.querySelector('.main-area > div[style*="overflow"]');
            const mainGrid = document.querySelector('.room-main-grid');
            const heroCard = document.querySelector('.room-hero-card');
            const coverArt = heroCard ? heroCard.querySelector('div[style*="240px"], img') : null;
            const panelCards = document.querySelectorAll('.room-panel-card');
            const listeningCard = panelCards[0];
            const queueCard = panelCards[1];

            // Check any horizontal overflow
            const allElements = Array.from(document.querySelectorAll('*'));
            const overflowElements = allElements.filter(el => {
              // Ignore body/html root
              if (el === document.body || el === document.documentElement) return false;
              // Check elements where content extends beyond client
              return el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !el.className?.includes('hide-scrollbar');
            }).map(el => ({
              tag: el.tagName,
              className: el.className,
              clientWidth: el.clientWidth,
              scrollWidth: el.scrollWidth,
              textSnippet: el.innerText ? el.innerText.slice(0, 30).replace(/\\n/g, ' ') : ''
            }));

            return {
              windowWidth: window.innerWidth,
              scrollContainer: scrollContainer ? {
                clientWidth: scrollContainer.clientWidth,
                scrollWidth: scrollContainer.scrollWidth,
              } : null,
              mainGrid: mainGrid ? {
                computedGridTemplateColumns: window.getComputedStyle(mainGrid).gridTemplateColumns,
                clientWidth: mainGrid.clientWidth,
                scrollWidth: mainGrid.scrollWidth,
              } : null,
              heroCard: heroCard ? {
                clientWidth: heroCard.clientWidth,
                scrollWidth: heroCard.scrollWidth,
              } : null,
              coverArt: coverArt ? {
                clientWidth: coverArt.clientWidth,
                offsetWidth: coverArt.offsetWidth,
              } : null,
              listeningCard: listeningCard ? {
                clientWidth: listeningCard.clientWidth,
                scrollWidth: listeningCard.scrollWidth,
              } : null,
              queueCard: queueCard ? {
                clientWidth: queueCard.clientWidth,
                scrollWidth: queueCard.scrollWidth,
              } : null,
              overflowCount: overflowElements.length,
              overflowList: overflowElements.slice(0, 5)
            };
          })()`,
          returnByValue: true,
        });

        const metrics = metricsRes.result.value;
        const screenshotPath = path.join(outDir, `room_${userConfig.roleName}_${vp.name}.png`);
        const ssRes = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(screenshotPath, Buffer.from(ssRes.data, 'base64'));

        console.log(`[${vp.name}×${vp.height}] ${userConfig.label}:`);
        console.log(`  - Grid columns: ${metrics.mainGrid?.computedGridTemplateColumns}`);
        console.log(`  - Hero Card: clientWidth=${metrics.heroCard?.clientWidth}px, scrollWidth=${metrics.heroCard?.scrollWidth}px`);
        console.log(`  - Cover Art: clientWidth=${metrics.coverArt?.clientWidth}px`);
        console.log(`  - Listening Card: clientWidth=${metrics.listeningCard?.clientWidth}px`);
        console.log(`  - Queue Card: clientWidth=${metrics.queueCard?.clientWidth}px`);
        console.log(`  - Page Scroll Container: clientWidth=${metrics.scrollContainer?.clientWidth}px, scrollWidth=${metrics.scrollContainer?.scrollWidth}px`);
        console.log(`  - Overflow Count: ${metrics.overflowCount}`);
        console.log(`  - Screenshot saved: ${screenshotPath}`);

        measurementsReport.push({
          role: userConfig.label,
          viewport: `${vp.name}×${vp.height}`,
          columns: metrics.mainGrid?.computedGridTemplateColumns,
          heroWidth: metrics.heroCard?.clientWidth,
          listeningWidth: metrics.listeningCard?.clientWidth,
          queueWidth: metrics.queueCard?.clientWidth,
          hasOverflow: metrics.scrollContainer?.scrollWidth > metrics.scrollContainer?.clientWidth,
          screenshot: screenshotPath,
        });
      }

      // Capture scrolled view at 390px to visually prove Listening Together & Queue reflow
      if (userConfig.roleName === 'creator') {
        await send('Emulation.setDeviceMetricsOverride', {
          width: 390,
          height: 844,
          deviceScaleFactor: 2,
          mobile: true,
        });
        await send('Runtime.evaluate', {
          expression: `(() => {
            const scroller = document.querySelector('.room-scroll-container') || document.querySelector('.main-area > div[style*="overflow"]');
            if (scroller) scroller.scrollTop = 520;
          })()`,
        });
        await new Promise((r) => setTimeout(r, 600));
        const scrolledSs = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, 'room_scrolled_panels_390.png'), Buffer.from(scrolledSs.data, 'base64'));
        console.log('  - Scrolled panel screenshot saved: room_scrolled_panels_390.png');

        // Capture Desktop view at 1280x800 to verify 2-column layout preservation
        await send('Emulation.setDeviceMetricsOverride', {
          width: 1280,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await send('Page.navigate', { url: `${BASE_URL}/room/${roomCode}` });
        await new Promise((r) => setTimeout(r, 1200));
        const desktopSs = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, 'room_desktop_1280.png'), Buffer.from(desktopSs.data, 'base64'));
        console.log('  - Desktop verification screenshot saved: room_desktop_1280.png');
      }
    }

    ws.close();

    // 6. Test playback synchronization
    console.log('\n[5/5] Verifying Synchronized Playback Flow...');
    // A plays next track
    const nextStateRes = await fetch(`${BASE_URL}/api/rooms/${room.id}/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: userA.cookieHeader,
      },
      body: JSON.stringify({
        current_song_id: activeSong.id,
        queue_index: 0,
        is_playing: true,
        position_ms: 25000,
      }),
    });
    const updatedState = await nextStateRes.json();
    console.log(`✓ Host state update acknowledged: is_playing=${updatedState.is_playing}, pos=${updatedState.position_ms}ms`);

    // Verify participant fetch receives state
    const fetchBRes = await fetch(`${BASE_URL}/api/rooms/${room.id}`, {
      headers: { Cookie: userB.cookieHeader },
    });
    const fetchedBData = await fetchBRes.json();
    const bState = fetchedBData.room_state || fetchedBData.roomState;
    console.log(`✓ Participant state check: is_playing=${bState.is_playing}, pos=${bState.position_ms}ms`);
    if (bState.is_playing && bState.position_ms === 25000) {
      console.log('✓ Synchronization Verification PASSED: Participant successfully synchronized with Host!');
    } else {
      console.error('✗ Synchronization mismatch');
    }

    console.log('\n================================================================');
    console.log('  SUMMARY TABLE');
    console.log('================================================================');
    console.table(measurementsReport);

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    chromeProcess.kill();
  }
}

main();
