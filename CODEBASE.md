# Cariño — Codebase Intelligence

## 0. Document Purpose

This document is the single canonical source of truth for understanding Cariño's codebase architecture, system ownership, file boundaries, and AI coding-agent governance.

* **Mandatory Reading**: All AI coding agents must consult this document before reading arbitrary files, conducting repository-wide searches, or modifying application code.
* **Core Function**: Answer immediately: *Where should I look, what owns this behavior, which files are relevant, and what must I avoid breaking?*
* **Maintenance Requirement**: This document must be updated whenever architectural boundaries, file responsibilities, or core behaviors are intentionally modified.

---

## 1. Agent Operating Protocol

To minimize context consumption, prevent regressions, and eliminate redundant discovery, every agent task must follow this strict investigation pipeline:

```
USER REQUEST
   │
   ▼
CLASSIFY ISSUE (Domain & Feature)
   │
   ▼
CONSULT CODEBASE.md (Section 3 & Section 4)
   │
   ▼
FIND ROUTING ENTRY & OWNER FILE
   │
   ▼
READ OWNER FILE FIRST (Targeted slice)
   │
   ▼
READ ONLY DIRECT DEPENDENCIES (If necessary)
   │
   ▼
CHECK HISTORICAL REGRESSIONS & RECENT CHANGES (Section 7 & Section 8)
   │
   ▼
IMPLEMENT MINIMAL SURGICAL CHANGE
   │
   ▼
RUN VALIDATION MATRIX (Section 10)
   │
   ▼
UPDATE CODEBASE.md (If architecture or behavior changed)
```

### Prohibited Defaults
* **No Repository-Wide Grepping**: Never run `grep_search` across the whole repository as a first step for common terms (e.g., `player`, `favourite`, `song`, `room`, `state`, `audio`, `like`, `sync`). Use Section 4 (Issue → File Routing Map) to locate the exact owner.
* **No Speculative Exploration**: Do not read multiple component files hoping to find where an action is processed.
* **No Broad Refactoring**: Never reformat, clean up, rename, or restyle code outside the requested scope.

### Scope Expansion Criteria
Agents are permitted to expand beyond the documented owner file **only** under these 4 conditions:
1. The routing map does not identify the feature or implementation.
2. The documented owner file explicitly delegates responsibility to another module.
3. The live implementation directly contradicts the documentation.
4. The defect cannot be reproduced or resolved within the documented scope.

*When expanding scope, the agent must explicitly state the reason before inspecting additional files.*

---

## 2. Project Architecture at a Glance

* **Framework**: Next.js 16.3.5 (App Router, Turbopack, React 19.2.8 Server & Client Components).
* **Language**: TypeScript 5.
* **Styling**: Tailwind CSS v4 (`@tailwindcss/postcss: ^4`, `tailwindcss: ^4`) with vanilla CSS custom properties design tokens defined in [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css).
* **Client State Management**: Zustand v5 (4 partitioned stores: `playerStore`, `roomStore`, `libraryStore`, `authStore`).
* **Animations**: Framer Motion v13 (carousel transitions, wave animations, modal overlays).
* **Audio Engine**: Custom HTML5 single-element audio engine ([components/player/AudioEngine.tsx](file:///c:/Users/iaman/carino/components/player/AudioEngine.tsx)) with custom cubic bezier volume fade envelopes.
* **Backend / Database**:
  * **Production**: Supabase (PostgreSQL with RLS, Supabase Auth via SSR cookies, Supabase Storage for audio & artwork, Supabase Realtime for room broadcast & presence).
  * **Local / Development Fallback**: Zero-dependency disk storage in `.storage/` ([lib/storage/local.ts](file:///c:/Users/iaman/carino/lib/storage/local.ts)) + Server-Sent Events / BroadcastChannel dual-transport fallback ([lib/realtime/roomSync.ts](file:///c:/Users/iaman/carino/lib/realtime/roomSync.ts)).
* **Security & Auth**: Dual-layer authentication via [middleware.ts](file:///c:/Users/iaman/carino/middleware.ts) and [lib/auth/server.ts](file:///c:/Users/iaman/carino/lib/auth/server.ts). Role-based access control (`user` vs `admin`) strictly enforced on server.
* **PWA**: `@ducanh2912/next-pwa` with web manifest configured in [app/manifest.ts](file:///c:/Users/iaman/carino/app/manifest.ts).

---

## 3. System Ownership Map

| System | Primary Owner (Authority) | State Store | UI Surfaces | API / Server Handler | Persistence Layer | Critical Dependencies |
|---|---|---|---|---|---|---|
| **Audio Playback Engine** | [components/player/AudioEngine.tsx](file:///c:/Users/iaman/carino/components/player/AudioEngine.tsx) | [stores/playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts) | [MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx), [ExpandedPlayer.tsx](file:///c:/Users/iaman/carino/components/player/ExpandedPlayer.tsx) | None (Browser Audio API) | `HTMLAudioElement` runtime | Single audio element, Safe volume fades |
| **Player State & Queue** | [stores/playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts) | [stores/playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts) | MiniPlayer, ExpandedPlayer, Tracks, Favorites | None | Ephemeral in-memory | AudioEngine synchronization |
| **3D Album Carousel** | [components/player/AlbumCarousel.tsx](file:///c:/Users/iaman/carino/components/player/AlbumCarousel.tsx) | Controlled via props | [AlbumCarousel.tsx](file:///c:/Users/iaman/carino/components/player/AlbumCarousel.tsx) | None | None | 3D CSS transforms, pointer events |
| **Ambient Visuals / Wave** | [components/player/CarouselBackground.tsx](file:///c:/Users/iaman/carino/components/player/CarouselBackground.tsx), [RightPanel.tsx](file:///c:/Users/iaman/carino/components/home/RightPanel.tsx) | Props / Canvas | Background blur, Canvas wave | None | None | Canvas 2D context, cover art URLs |
| **Music Catalog (Songs)** | [lib/supabase/songs.ts](file:///c:/Users/iaman/carino/lib/supabase/songs.ts) | [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts) | [app/tracks/page.tsx](file:///c:/Users/iaman/carino/app/tracks/page.tsx), [RightPanel.tsx](file:///c:/Users/iaman/carino/components/home/RightPanel.tsx) | [app/api/songs/route.ts](file:///c:/Users/iaman/carino/app/api/songs/route.ts), [app/api/songs/[id]/route.ts](file:///c:/Users/iaman/carino/app/api/songs/[id]/route.ts) | Supabase `songs` table / `.storage/songs.json` | Catalog cache, audio URLs |
| **Catalog Realtime Sync** | [lib/realtime/catalogSync.ts](file:///c:/Users/iaman/carino/lib/realtime/catalogSync.ts) | [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts) | Auto-updates song lists across open tabs | Supabase Realtime postgres_changes | None | Broadcast channel |
| **Favourite Tracks** | [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts) | `libraryStore.favouriteSongIds` | MiniPlayer, ExpandedPlayer, RightPanel, [app/favorites/page.tsx](file:///c:/Users/iaman/carino/app/favorites/page.tsx) | [app/api/favorites/route.ts](file:///c:/Users/iaman/carino/app/api/favorites/route.ts) | User-scoped `.storage/favorites.json` + `localStorage` | Authenticated session (`user.id`), In-flight locks |
| **Playlists & Tracks** | [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts) | `libraryStore.playlists` | [app/playlists/page.tsx](file:///c:/Users/iaman/carino/app/playlists/page.tsx), [AddToPlaylistModal.tsx](file:///c:/Users/iaman/carino/components/player/AddToPlaylistModal.tsx) | [app/api/playlists/route.ts](file:///c:/Users/iaman/carino/app/api/playlists/route.ts), `[id]/tracks` | Supabase `playlists`, `playlist_tracks` / `.storage/` | RLS policies |
| **Authentication** | [lib/auth/server.ts](file:///c:/Users/iaman/carino/lib/auth/server.ts), [middleware.ts](file:///c:/Users/iaman/carino/middleware.ts) | [stores/authStore.ts](file:///c:/Users/iaman/carino/stores/authStore.ts) | [app/login/page.tsx](file:///c:/Users/iaman/carino/app/login/page.tsx), [TopBar.tsx](file:///c:/Users/iaman/carino/components/navigation/TopBar.tsx) | [app/api/auth/session/route.ts](file:///c:/Users/iaman/carino/app/api/auth/session/route.ts), `dev-login`, `logout` | Supabase Auth cookies / `carino_dev_session` | OAuth provider config, secure cookies |
| **User Profiles & RBAC** | [lib/auth/server.ts](file:///c:/Users/iaman/carino/lib/auth/server.ts) | [stores/authStore.ts](file:///c:/Users/iaman/carino/stores/authStore.ts), [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts) | [AccountModal.tsx](file:///c:/Users/iaman/carino/components/modals/AccountModal.tsx), TopBar | [app/api/account/route.ts](file:///c:/Users/iaman/carino/app/api/account/route.ts) | Supabase `profiles` table / `.storage/profile.json` | 1MB avatar size limit, admin email fallback |
| **Listening Rooms Core** | [stores/roomStore.ts](file:///c:/Users/iaman/carino/stores/roomStore.ts) | [stores/roomStore.ts](file:///c:/Users/iaman/carino/stores/roomStore.ts) | [app/room/[code]/page.tsx](file:///c:/Users/iaman/carino/app/room/[code]/page.tsx), [app/room/page.tsx](file:///c:/Users/iaman/carino/app/room/page.tsx) | [app/api/rooms/route.ts](file:///c:/Users/iaman/carino/app/api/rooms/route.ts), `[id]/state`, `[id]/members` | Supabase `rooms`, `room_members`, `room_state` / `.storage/` | Room codes, host permissions |
| **Realtime Room Sync** | [lib/realtime/roomSync.ts](file:///c:/Users/iaman/carino/lib/realtime/roomSync.ts) | `roomStore`, `playerStore` | Room view, Audio Unlock handshake | [app/api/rooms/[id]/events/route.ts](file:///c:/Users/iaman/carino/app/api/rooms/[id]/events/route.ts) | Supabase Realtime channel / SSE stream | Drift correction (>1.5s jump, >300ms speed adjustment) |
| **Uploads & Cockpit** | [components/modals/CockpitModal.tsx](file:///c:/Users/iaman/carino/components/modals/CockpitModal.tsx) | Local modal state | CockpitModal, [app/admin/page.tsx](file:///c:/Users/iaman/carino/app/admin/page.tsx) | [app/api/upload/file/route.ts](file:///c:/Users/iaman/carino/app/api/upload/file/route.ts), `signed-url` | Supabase Storage (`audio`, `covers`) / `.storage/` | File size limits (audio 50MB, cover 10MB) |
| **Media Proxy** | [app/api/media/route.ts](file:///c:/Users/iaman/carino/app/api/media/route.ts) | Stateless | Image & audio URL resolvers | [app/api/media/route.ts](file:///c:/Users/iaman/carino/app/api/media/route.ts) | Local disk `.storage/` streaming | Content-Type verification, path sanitization |
| **Promotional Banners** | [components/home/BannerCarousel.tsx](file:///c:/Users/iaman/carino/components/home/BannerCarousel.tsx), [CockpitModal.tsx](file:///c:/Users/iaman/carino/components/modals/CockpitModal.tsx) | Local state | Home banner carousel, Cockpit Banners tab | [app/api/banners/route.ts](file:///c:/Users/iaman/carino/app/api/banners/route.ts) | Supabase Storage (`covers` bucket) / `.storage/banners.json` | 4 slots, 1200x480px, admin-only edits, same-session event |
| **Navigation & Shell** | [components/navigation/Sidebar.tsx](file:///c:/Users/iaman/carino/components/navigation/Sidebar.tsx), [TopBar.tsx](file:///c:/Users/iaman/carino/components/navigation/TopBar.tsx) | Layout composition | Sidebar, TopBar, BottomNav | Search query in URL | None | Route matching |

---

## 4. Issue → File Routing Map

Use this section to map any incoming user request or bug report directly to owner files.

### 4.1 Playback & Audio Controls
* **Triggers**: Next button, previous button, song doesn't change, audio doesn't start, audio keeps playing, play/pause desync, seek error, volume issue, fade glitch, double audio playing.
* **FIRST INSPECT**:
  1. [components/player/AudioEngine.tsx](file:///c:/Users/iaman/carino/components/player/AudioEngine.tsx) (owns physical playback & fade transitions)
  2. [stores/playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts) (owns logical playback state, queue, currentTime, duration)
* **THEN IF UI-SPECIFIC**:
  3. [components/player/MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) (desktop bottom bar controls)
  4. [components/player/ExpandedPlayer.tsx](file:///c:/Users/iaman/carino/components/player/ExpandedPlayer.tsx) (fullscreen player controls)
* **DO NOT FIRST INSPECT**:
  * [AlbumCarousel.tsx](file:///c:/Users/iaman/carino/components/player/AlbumCarousel.tsx) (does NOT own audio playback)
  * [lib/realtime/roomSync.ts](file:///c:/Users/iaman/carino/lib/realtime/roomSync.ts) (unless inside a shared room)
* **ARCHITECTURAL RULE**: `AudioEngine.tsx` is the sole audio authority. Only ONE `HTMLAudioElement` may ever exist. UI components must never instantiate `new Audio()` or manipulate audio elements directly.

### 4.2 Favourite / Like System
* **Triggers**: Like button, heart icon, favourite toggle, unliking track, track not appearing in `/favorites`, outline vs filled heart desync.
* **FIRST INSPECT**:
  1. [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts) (`favouriteSongIds`, `toggleFavourite`, `inFlightFavoriteIds`)
  2. [app/api/favorites/route.ts](file:///c:/Users/iaman/carino/app/api/favorites/route.ts) (authenticated persistence route)
* **THEN IF SURFACE-SPECIFIC**:
  3. [components/player/MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) (bottom bar heart)
  4. [components/home/RightPanel.tsx](file:///c:/Users/iaman/carino/components/home/RightPanel.tsx) (hero track card heart)
  5. [components/player/ExpandedPlayer.tsx](file:///c:/Users/iaman/carino/components/player/ExpandedPlayer.tsx) (fullscreen player heart)
  6. [app/favorites/page.tsx](file:///c:/Users/iaman/carino/app/favorites/page.tsx) (favourite tracks list)
* **DO NOT FIRST INSPECT**:
  * [AudioEngine.tsx](file:///c:/Users/iaman/carino/components/player/AudioEngine.tsx) or [playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts) (favourites are managed by `libraryStore`, not playback)
* **ARCHITECTURAL RULE**: Components must subscribe directly to `useLibraryStore((s) => s.favouriteSongIds)` so that toggles reactively re-render all surfaces synchronously.

### 4.3 3D Album Carousel & Visuals
* **Triggers**: Carousel cover swipe, cover flip, 3D tilt, active slide focus, ambient background color, canvas audio waveform.
* **FIRST INSPECT**:
  1. [components/player/AlbumCarousel.tsx](file:///c:/Users/iaman/carino/components/player/AlbumCarousel.tsx) (3D transform calculations, touch gestures)
  2. [components/player/CarouselBackground.tsx](file:///c:/Users/iaman/carino/components/player/CarouselBackground.tsx) (blurred cover glow)
* **ARCHITECTURAL RULE**: The carousel visual position mirrors `playerStore.currentTrack`, but selecting a track invokes `onSelectSong` to delegate playback to `playerStore`.

### 4.4 Shared Listening Rooms & Realtime Sync
* **Triggers**: Room join failure, room sync lag, participants out of sync, drift, room leave issue, audio unlock banner, room chat/events, host controls.
* **FIRST INSPECT**:
  1. [lib/realtime/roomSync.ts](file:///c:/Users/iaman/carino/lib/realtime/roomSync.ts) (authoritative sync engine, drift correction, SSE/Supabase dual transport)
  2. [stores/roomStore.ts](file:///c:/Users/iaman/carino/stores/roomStore.ts) (room membership, host state, sync status)
* **THEN IF API-SPECIFIC**:
  3. [app/api/rooms/[id]/events/route.ts](file:///c:/Users/iaman/carino/app/api/rooms/[id]/events/route.ts) (SSE event stream)
  4. [app/api/rooms/[id]/state/route.ts](file:///c:/Users/iaman/carino/app/api/rooms/[id]/state/route.ts) (persisted state sync)
* **ARCHITECTURAL RULE**: Realtime sync reports ground truth from the physical `HTMLAudioElement`. When leaving a room, `roomSync.leaveRoom()` must increment `sessionEpoch` and isolate local playback completely.

### 4.5 Authentication, Session & Profile
* **Triggers**: Login redirect loop, Google login fails, dev login fails, admin role not recognized, profile update fails, avatar upload fails.
* **FIRST INSPECT**:
  1. [lib/auth/server.ts](file:///c:/Users/iaman/carino/lib/auth/server.ts) (authoritative server validation)
  2. [middleware.ts](file:///c:/Users/iaman/carino/middleware.ts) (edge route gate)
  3. [stores/authStore.ts](file:///c:/Users/iaman/carino/stores/authStore.ts) (client session actions)
* **THEN IF API-SPECIFIC**:
  4. [app/api/auth/session/route.ts](file:///c:/Users/iaman/carino/app/api/auth/session/route.ts)
  5. [app/api/account/route.ts](file:///c:/Users/iaman/carino/app/api/account/route.ts)
* **ARCHITECTURAL RULE**: Never trust client-supplied `isAdmin` or `role`. All admin endpoints must call `requireAdmin(req)`.

### 4.6 File Uploads & Admin Catalog
* **Triggers**: Upload fails, audio file rejected, cover file rejected, song metadata edit, restore catalog, banner upload.
* **FIRST INSPECT**:
  1. [components/modals/CockpitModal.tsx](file:///c:/Users/iaman/carino/components/modals/CockpitModal.tsx)
  2. [app/api/upload/file/route.ts](file:///c:/Users/iaman/carino/app/api/upload/file/route.ts)
  3. [lib/supabase/storage.ts](file:///c:/Users/iaman/carino/lib/supabase/storage.ts) / [lib/storage/serverUpload.ts](file:///c:/Users/iaman/carino/lib/storage/serverUpload.ts)
* **ARCHITECTURAL RULE**: Uploads enforce strict file limits (Audio: 50MB; Cover: 10MB; Avatar: 1MB).

### 4.7 Promotional Banners & Admin CMS
* **Triggers**: Home banner text, banner image, banner stats, banner subtitle, banner category, banner crop, dashboard hero banner.
* **FIRST INSPECT**:
  1. [components/home/BannerCarousel.tsx](file:///c:/Users/iaman/carino/components/home/BannerCarousel.tsx) (Home banner rendering, 4s slide, dynamic field consumption)
  2. [components/modals/CockpitModal.tsx](file:///c:/Users/iaman/carino/components/modals/CockpitModal.tsx) (Admin banner content & image editor)
  3. [app/api/banners/route.ts](file:///c:/Users/iaman/carino/app/api/banners/route.ts) (Admin-authorized persistence endpoint)
  4. [components/modals/BannerCropperModal.tsx](file:///c:/Users/iaman/carino/components/modals/BannerCropperModal.tsx) (2.5:1 aspect ratio interactive cropper)
* **ARCHITECTURAL RULE**: Exactly 4 banner slots identified by persistent ID (1–4). Server-side `requireAdmin(req)` strictly gates both JSON content edits and multipart image uploads. Home UI visual design and dimensions (1200×480px, 2.5:1) are locked. Same-session UI update propagates via `carino:banners-updated` DOM event. Animated GIFs MUST bypass 2D canvas croppers to avoid flattening to static JPEG; `/api/banners` and `/api/media` strictly preserve `image/gif` MIME type and `.gif` storage paths.

---

## 5. File-Level Documentation

### [components/player/AudioEngine.tsx](file:///c:/Users/iaman/carino/components/player/AudioEngine.tsx)
* **Responsibility**: Authoritative manager of the single physical `HTMLAudioElement`.
* **Owns**: Physical audio source assignment, play/pause execution, volume fade envelope calculations (fade-down 220ms, fade-up 450ms, natural end fade 750ms), timeupdate throttling (250ms), audio error handling.
* **Depends on**: `playerStore`, `libraryStore`, `getAudioUrl`.
* **Must not**: Be duplicated; must not allow external components to manipulate volume during active fade transitions.
* **Validation**: Run playback verification across track transitions; verify audio changes simultaneously with UI.

### [stores/playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts)
* **Responsibility**: State container for current song, playlist queue, playback status, logical volume, and repeat mode.
* **Owns**: `currentTrack`, `queue`, `queueIndex`, `isPlaying`, `currentTime`, `duration`, `volume`, `muted`, `repeatMode`, `isExpanded`.
* **Must not**: Contain audio playback DOM APIs (keeps state cleanly serializable).
* **Validation**: `npx tsc --noEmit` and manual verification of queue navigation (`goToNext`, `goToPrevious`).

### [lib/realtime/roomSync.ts](file:///c:/Users/iaman/carino/lib/realtime/roomSync.ts)
* **Responsibility**: Coordinates dual-transport synchronization between room members.
* **Owns**: Supabase Realtime broadcast channels, SSE event stream subscriptions, drift detection (>1.5s hard seek, >300ms playbackRate compensation), heartbeat pulses, session epoch isolation.
* **Must not**: Allow stale remote events to mutate audio after a room leave event.

### [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts)
* **Responsibility**: Central client store for songs, playlists, recently played, favourites, and user profile cache.
* **Owns**: `favouriteSongIds`, `inFlightFavoriteIds`, `songs`, `playlists`, `recentlyPlayed`, `userProfile`.
* **Must not**: Use un-debounced requests for favourites; must maintain optimistic rollback on network failure.

### [lib/auth/server.ts](file:///c:/Users/iaman/carino/lib/auth/server.ts)
* **Responsibility**: Single security boundary for session validation and role authorization.
* **Owns**: `getAuthenticatedUser()`, `requireAuth()`, `requireAdmin()`, dev cookie decoding, profile role verification against Supabase `profiles`.
* **Must not**: Trust client parameters; must fail closed on missing/invalid credentials.

---

## 6. Protected Systems

| System | Protection Level | Why Protected | What Must NOT Be Changed Casually | Post-Change Validation |
|---|---|---|---|---|
| **AudioEngine.tsx** | **CRITICAL** | Core music playback stability. Previous race conditions between fades and track switches broke audio continuity. | Volume fade cubic bezier timings, single audio instance lifecycle, `timeupdate` reporting frequency. | TypeScript + lint + build + multi-track switch audio test |
| **playerStore.ts** | **CRITICAL** | Consumed by 15+ components. State shape mutations cause app-wide build failures. | Property names (`currentTrack`, `isPlaying`, `queue`, `repeatMode`), action signatures. | Full TypeScript compilation (`npx tsc --noEmit`) |
| **roomSync.ts** | **CRITICAL** | Manages distributed playback synchronization across clients. Sensitive to network timing and race conditions. | Drift thresholds (1.5s / 300ms), `sessionEpoch` guards, audio unlock logic. | Multi-client synchronization test + room leave verification |
| **lib/auth/server.ts & RLS** | **CRITICAL** | Security boundary preventing unauthorized admin escalation and catalog corruption. | `requireAuth()`, `requireAdmin()`, role checks, storage bucket permissions. | Auth & permission integration tests (`verify-auth-authorization.mjs`) |
| **AlbumCarousel.tsx** | **HIGH** | Complex 3D CSS math, gesture handling, and responsive layout. | CSS 3D perspective transforms, cover index computation, touch event traps. | Touch & drag gesture checks on mobile and desktop viewports |
| **libraryStore.ts** | **HIGH** | Manages catalogue, playlists, and user favourites. | `toggleFavourite` rollback mechanism, `favouriteSongIds` array reactivity. | Favourite toggle verification across MiniPlayer, ExpandedPlayer, and RightPanel |

---

## 7. Historical Regressions (Known Pitfalls)

To prevent re-introducing bugs that were previously resolved, keep these historical incidents in mind:

### 1. Carousel Slide Move vs Audio Change Desynchronization
* **Bug**: Clicking Next/Previous moved the visual carousel, but the audio either failed to switch or delayed indefinitely due to overlapping asynchronous fade loops.
* **Fix**: Rebuilt `AudioEngine.tsx` around deterministic single-element track switching. Track change now immediately overrides any in-progress fade, smoothly fades down (220ms), swaps `src`, and fades up (450ms).
* **Rule**: `AlbumCarousel.tsx` must never be given playback authority. It strictly displays what `playerStore` dictates.

### 2. Room Leave Event Leaks & Playback Interruption
* **Bug**: When a listener left a shared room, incoming SSE or Realtime broadcast packets from the room continued to arrive, suddenly pausing or changing the user's independent audio.
* **Fix**: Introduced `sessionEpoch` inside `RoomSyncManager`. Calling `leaveRoom()` immediately increments `sessionEpoch`, unbinds listeners, closes transport connections, and isolates local playback.
* **Rule**: Stale events matching an older `sessionEpoch` are unconditionally discarded.

### 3. Favourites Selector Non-Reactivity
* **Bug**: Heart buttons in `MiniPlayer`, `RightPanel`, and `ExpandedPlayer` subscribed to `useLibraryStore((s) => s.isFavourite)`. Because `isFavourite` was a static function reference, components never re-rendered when the underlying `favouriteSongIds` array changed. Toggling appeared broken.
* **Fix**: Components now subscribe directly to `useLibraryStore((s) => s.favouriteSongIds)`.
* **Rule**: Never subscribe to static methods in Zustand when checking item inclusion; always select the underlying reactive collection.

### 4. Accidental Volume Row in Expanded Player
* **Bug**: A redundant volume slider row in `ExpandedPlayer` cluttered mobile screens and conflicted with system hardware volume controls.
* **Fix**: Removed the volume slider row from `ExpandedPlayer.tsx`. The Expanded Player layout ends cleanly after the playback controls row: `Repeat → Previous → Play/Pause → Next → Like`.
* **Rule**: Do not re-add inline volume controls to `ExpandedPlayer` unless explicitly requested.

### 5. Animated GIF Banner Canvas Flattening
* **Bug**: Admin-uploaded animated GIFs appeared static in the Home banner carousel because `BannerCropperModal`'s HTML5 2D canvas (`ctx.drawImage`) rasterized only frame 0 and transcoded the output to a static JPEG (`image/jpeg`).
* **Fix**: In `CockpitModal`, animated GIF uploads (`file.type === 'image/gif'` or `.gif` extension) bypass `BannerCropperModal` and upload the raw multi-frame file directly. `BannerCropperModal` also includes a defensive passthrough. `/api/banners` strictly preserves `ext = 'gif'` and `contentType = 'image/gif'`.
* **Rule**: Never pass animated GIFs through HTML5 2D Canvas `drawImage` or `canvas.toBlob('image/jpeg')`. Always upload the raw GIF `File` to preserve animation frames.

## 8. Recent Change Ledger

### 2026-09-20 — Phase 3A.3: Final Mobile Navigation Atmosphere Correction
* **User Intent**: Remove the remaining visual black slab/box at the bottom of the mobile viewport and establish a true floating atmospheric lens:
  1. Extended Progressive Atmosphere Lens: Increased atmospheric lens vertical coverage to 240px from viewport bottom (`.nav-atmosphere-outer` 240px with 8px blur, `.nav-atmosphere-middle` 170px with 16px blur, and `.nav-atmosphere-inner` 100px with 24px blur).
  2. Critical Top Fade: Atmosphere initiates progressive softening 100px+ above the MiniPlayer, gradually diffusing sharp dashboard content as it scrolls toward the controls.
  3. Critical Bottom Blur: Eliminated the premature bottom-edge mask cutoff (`transparent 100%`). The atmospheric blur and translucent neutral material now stay active all the way down to the bottom edge (`black 100%`), keeping the space below Home, Join Party, and More blurred, frosted, and free of any hard black edge.
  4. Protected Systems: AudioEngine, playerStore, roomSync, roomStore, Supabase/Auth/RLS, PWA, AlbumCarousel, ExpandedPlayer, and all desktop systems remained 100% untouched.
* **Files Modified**:
  * [components/navigation/BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) (Extended atmospheric lens: 240px outer / 170px middle / 100px inner; feathered top fade and continuous bottom blur)
* **Validation**: Real screenshot validation across all 3 mobile viewports (412×924, 390×844, 375×812); TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), playback loop verification (8/8 passed), and favorites toggle suites all passed with 0 errors.

### 2026-09-20 — Phase 3A.2: Mobile Atmospheric Nav + MiniPlayer Material Correction
* **User Intent**: Implement forensic diagnostic findings to resolve visual atmosphere effectiveness and MiniPlayer material:
  1. Multi-Layer Progressive Atmospheric Lens: Replaced the ineffective near-black `rgba(10,10,10,...)` gradient in [BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) with a 3-layer progressive neutral/frosted atmosphere lens (`.nav-atmosphere-outer` with 3px blur across 140px, `.nav-atmosphere-middle` with 6px blur across 105px, and `.nav-atmosphere-inner` with 10px blur and luminous frosted presence across 76px). Each layer feathers to 100% transparent at top and bottom edges, producing a soft, progressive blur/frost lens without any hard horizontal lines, rectangular boundaries, or black tinting.
  2. Mobile MiniPlayer Material Refinement: Updated the mobile-only MiniPlayer container in [MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) from heavy dark glass (`rgba(18,18,22,0.72)`) to a compact, translucent neutral frosted surface (`rgba(255, 255, 255, 0.08)`, `backdropFilter: blur(20px)`, `border: 1px solid rgba(255, 255, 255, 0.12)`, restrained shadow `0 4px 20px rgba(0, 0, 0, 0.35)`). Scrolling dashboard content and artwork now visibly pass and soften underneath.
  3. Desktop & Core Architecture: Desktop MiniPlayer, Sidebar, TopBar, and 5-column library grid remain 100% untouched. AudioEngine, playerStore, roomSync, roomStore, and background playback remain 100% untouched.
* **Files Modified**:
  * [components/navigation/BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) (Multi-layer progressive neutral atmospheric lens; kept `<nav className="nav-area">` completely transparent and unstyled)
  * [components/player/MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) (Refined mobile MiniPlayer material to compact frosted glass; preserved desktop styling)
  * [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) (Added `.nav-atmosphere-zone` to desktop media query hiding)
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), playback loop verification (8/8 passed), and favorites toggle suites all passed with 0 errors. Multi-viewport screenshots (412×924, 390×844, 375×812) verified.

### 2026-09-20 — Phase 3A.1: Mobile Navigation Material Correction — Complete Nav Container Removal
* **User Intent**: Completely remove the visible navigation container (black rectangle, rounded pill, horizontal bar background, or visible perimeter edges) behind the mobile controls:
  1. Complete Container Removal: `<nav className="nav-area">` has zero background, zero border, zero shadow, zero border-radius, and zero backdrop-filter (`background: transparent !important; border: none !important; box-shadow: none !important; border-radius: 0 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; pointer-events: none`). It serves strictly as an invisible layout coordinator.
  2. Floating Atmospheric Control Zone: Replaced the fixed opaque gradient with a progressive, two-way vertical atmosphere (`.nav-atmosphere`) spanning `calc(var(--safe-bottom, 0px) + 120px)`. Uses a smooth vertical gradient that starts 100% transparent at top, peaks at 0.24 opacity near the controls, and feathers to 100% transparent at the bottom safe area (`maskImage` feathers blur seamlessly to transparent at both top and bottom edges). Zero hard horizontal edges exist; the dashboard content, artwork, and feed visibly move and flow continuously underneath.
  3. Independent Controls: **Home** floats independently with its own translucent frosted glass circle (`44×44px`, `backdropFilter: blur(16px)`). **Join Party** floats independently as a canonical white pill button (`#FFFFFF`, text `#000000`, `borderRadius: 9999px`). **More** floats independently with its own translucent frosted glass circle (`44×44px`, `backdropFilter: blur(16px)`).
  4. MiniPlayer, Desktop & Core Systems: MiniPlayer is completely untouched. Desktop Sidebar, TopBar, and 5-column grid are completely untouched. AudioEngine, playerStore, roomSync, and database systems are 100% untouched.
* **Files Modified**:
  * [components/navigation/BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) (Applied progressive 2-way vertical atmospheric fade with feathered mask; stripped all container visual styling from `<nav className="nav-area">`)
  * [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) (Explicitly set `.nav-area` to zero border-radius, zero backdrop-filter, zero background, zero border, and zero box-shadow)
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), and Next.js production build (`npm run build`) all exited with code 0.

### 2026-09-20 — Phase 3A Correction: Mobile Control Surface Composition
* **User Intent**: Surgically correct mobile control surface architecture to eliminate the shared bottom navigation bar/pill container and refine MiniPlayer:
  1. Mobile Bottom Navigation: Removed the shared parent container, background, and borders completely. Home (left) and More (right) float as independent frosted circular translucent surfaces (`44×44px`, `backdropFilter: blur(16px)`). Join Party (center) floats as an independent white rounded button (`#FFFFFF`, text `#000000`, `fontWeight: 700`). Clear dashboard space flows between all three controls. Added a progressive atmospheric blur/fade (`.nav-atmosphere`) with soft vertical falloff (`maskImage: linear-gradient`) and zero hard lines.
  2. Mobile MiniPlayer: Composed strictly of Left (Artwork + Track Title + Singer/Artist Name), Right (dominant Play/Pause + Lyrics toggle), and Bottom Edge (playback progress line forming the bottom perimeter of the floating frosted MiniPlayer). Removed duplicate progress bars and redundant controls. Tapping surface directly triggers canonical [ExpandedPlayer.tsx](file:///c:/Users/iaman/carino/components/player/ExpandedPlayer.tsx).
  3. Desktop & Protected Systems: Zero changes to desktop Sidebar, TopBar, MiniPlayer, or 5-column library grid. AudioEngine, playerStore, roomSync, and playback architecture remain 100% untouched.
* **Files Modified**:
  * [components/player/MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) (Left: Artwork + Title + Artist; Right: Play/Pause + Lyrics; Bottom Edge: seek line; preserved desktop MiniPlayer unchanged)
  * [components/navigation/BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) (Removed parent background pill; added soft `.nav-atmosphere` progressive blur; Home, Join Party, and More float independently with visible dashboard space between them)
  * [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) (Set `.nav-area` to transparent/borderless/shadowless; `.player-area` at `calc(var(--safe-bottom, 0px) + 76px)`; scroll padding at `calc(148px + var(--safe-bottom, 0px))`)
  * [app/page.tsx](file:///c:/Users/iaman/carino/app/page.tsx) (Aligned mobile scroll container bottom padding to `calc(148px + var(--safe-bottom, 0px))`)
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), playback loop verification (8/8 passed), and favorites toggle suites (all passed) exited with code 0.

### 2026-09-19 — Phase 4.2 Stage 1 & 2: Mobile Shell Structural Fix, Mobile Header & Home Rails Remediation
* **User Intent**: Fix structural mobile grid defects (hidden desktop sidebar, active bottom navigation, full-bleed content without reserved nav row), implement mobile-first Home feed composition with brand-locked mobile header and horizontal artwork rails while keeping desktop 100% intact. Remediate mobile header to include the official Cariño symbol (`/brand/carino-symbol.svg`) with 10px gap and prevent flex-shrink collapse on the mobile Featured BannerCarousel.
* **Files Modified**:
  * [components/navigation/Sidebar.tsx](file:///c:/Users/iaman/carino/components/navigation/Sidebar.tsx) (Removed conflicting inline display styles so stylesheet media queries control visibility)
  * [components/navigation/BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) (Removed isMobile state gate to prevent hydration pop-in; rendered unconditionally with CSS desktop hiding)
  * [components/navigation/TopBar.tsx](file:///c:/Users/iaman/carino/components/navigation/TopBar.tsx) (Restored official Cariño brand lockup: `/brand/carino-symbol.svg` + "cariño" wordmark linking home, avatar button, admin Cockpit orb, and full-width search pill)
  * [components/home/BannerCarousel.tsx](file:///c:/Users/iaman/carino/components/home/BannerCarousel.tsx) (Responsive clamp padding, min-height, border radius, and flexShrink: 0)
  * [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) (Simplified mobile grid template, moved flex properties to .sidebar-area, added .hide-scrollbar utility)
  * [app/page.tsx](file:///c:/Users/iaman/carino/app/page.tsx) (Added mobile-first composition featuring 4 horizontal content rails: Your Library, Recently Played, Favourites, and Playlists with See All navigation; wrapped BannerCarousel in flexShrink: 0 container to prevent flex collapse; left desktop 5-column grid intact)
* **Protected Systems Fully Preserved**: AudioEngine, playerStore, roomSync, roomStore, Supabase/Auth/RLS, PWA, AlbumCarousel, and background playback were completely untouched.
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), playback loop verification, and favorites toggle suites all passed with 0 errors.

### 2026-09-20 — Phase 3A.3: Final Mobile Navigation Atmosphere Correction & Downward Fade Extension
* **User Intent**: Seamlessly extend the existing atmospheric blur/translucent fade downward across the MiniPlayer, through the navigation controls (Home, Join Party, More), and all the way to the very bottom edge of the mobile viewport, while positioning the upper boundary of the atmospheric blur close to the MiniPlayer bar (~30px above) so dashboard content directly above remains clear and unclouded.
* **Files Modified**:
  * [components/navigation/BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) (Tuned atmospheric layers to `165px` height anchored to `bottom: 0`, placing the upper soft gradient shoulder right above the MiniPlayer bar (~33px above it) with continuous `blur(16px)` and `blur(24px)` flowing uninterrupted behind the MiniPlayer, navigation controls, and to the absolute bottom edge).
* **Protected Systems Fully Preserved**: `AudioEngine.tsx`, `playerStore.ts`, `roomSync.ts`, `roomStore.ts`, `ExpandedPlayer.tsx`, `AlbumCarousel.tsx`, Auth/Supabase RLS, Desktop UI/Sidebar/TopBar/5-column grid were completely untouched.
* **Validation**:
  * Visual verification via headless Chrome screenshots across 3 mobile viewports: 412×924, 390×844, 375×812. Confirmed that content above the MiniPlayer is clear, blur begins tightly above the MiniPlayer bar, and flows continuously behind controls down to `bottom: 0px`.
  * TypeScript type check (`npx tsc --noEmit`): 0 errors.
  * ESLint (`npm run lint`): 0 errors.
  * Next.js production build (`npm run build`): 0 errors, 31 routes generated successfully.

### 2026-09-19 — Final UI/UX Polish Master: Shared Centerline, Drawer Push, Simplified Progress & White Volume Knob
* **User Intent**: Establish shared centerline alignment between Search Bar and MiniPlayer relative to available main content; synchronize smooth push when Lyrics Drawer opens; remove redundant timestamps and replace with single long horizontal progress bar with hover/drag focused state; change volume knob from blue to white; maintain strictly 5 columns on desktop library grid.
* **Files Modified**:
  * [components/navigation/TopBar.tsx](file:///c:/Users/iaman/carino/components/navigation/TopBar.tsx) (Centered Search Bar at exact 50% horizontal axis of main content with synchronized push transition)
  * [components/player/MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) (Aligned horizontal centering with main content; removed redundant center progress row; implemented single long progress bar with hover/drag focused state and subdued background content; made volume knob pure white)
  * [components/home/RightPanel.tsx](file:///c:/Users/iaman/carino/components/home/RightPanel.tsx) (Synchronized `drawer-open` class on `#app-root` for smooth main-area push)
  * [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) (Added `.drawer-open` transitions for `.main-area` and `.player-area`; white volume slider styles; tuned `.library-grid-5` breakpoints)
* **Protected Systems Fully Preserved**: AudioEngine, playerStore, playback lifecycle, ended-event transitions, and background playback were completely untouched.
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), continuous playback wrap and favorite toggle test suites passed.

### 2026-09-19 — Surgical MiniPlayer Background Strip Fix
* **User Intent**: Remove the black horizontal strip/band behind the floating MiniPlayer so page content (music artwork, cards, library) flows directly underneath the translucent MiniPlayer.
* **Root Cause**: `.main-area` had `padding-bottom: calc(var(--player-h) + 48px)` (110px) in `app/globals.css`. Because `.main-area` is a 100dvh flex column, this reserved bottom padding forced inner scrollable containers to stop 110px above the viewport bottom, exposing an empty solid black strip behind the floating MiniPlayer.
* **Files Modified**:
  * [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) (Set `padding-bottom: 0` on `.main-area` across desktop and mobile; added `.main-area > div[style*="overflow"]` clearance inside scroll content)
  * [app/page.tsx](file:///c:/Users/iaman/carino/app/page.tsx) and page views (Adjusted inner scroll container bottom padding to allow content to flow all the way to the viewport bottom behind the floating MiniPlayer)
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), playback loop and favourite verification scripts passed.

### 2026-09-19 — Visual Correction Pass: Navigation Color-Only, Floating MiniPlayer & 5-Column Grid
* **User Intent**: Remove colored boxes/pills from navigation items (active items color icon and text directly in clean editorial style); eliminate bottom navigation bar from desktop viewport completely; refine floating MiniPlayer to compact Apple Music-inspired footprint (740px max-width centered, 4 rounded corners, translucent backdrop blur); enforce exactly 5 tracks per row on desktop library grid.
* **Files Modified**:
  * [components/navigation/Sidebar.tsx](file:///c:/Users/iaman/carino/components/navigation/Sidebar.tsx) (Removed colored active background boxes/borders; colored icon and text directly)
  * [components/navigation/BottomNav.tsx](file:///c:/Users/iaman/carino/components/navigation/BottomNav.tsx) (Strictly mobile-only with null return on desktop; removed colored active pills)
  * [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) (Compact 740px centered player-area; strictly hide desktop nav-area; added `.library-grid-5`)
  * [components/player/MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) (Compact floating surface, all 4 corners rounded, preserved actual uploaded cover artwork, clean horizontal layout)
  * [app/page.tsx](file:///c:/Users/iaman/carino/app/page.tsx) & [app/albums/page.tsx](file:///c:/Users/iaman/carino/app/albums/page.tsx) (Enforced exactly 5 tracks per row on desktop)
* **Validation**: Full TypeScript typecheck (`npx tsc --noEmit`), ESLint (`npm run lint`), and Next.js production build (`npm run build`).

### 2026-09-19 — Animated GIF Banner Preservation & Upload Fix
* **User Intent**: Resolve issue where admin-uploaded animated GIF banners were frozen/static in the banner carousel.
* **Files Modified**:
  * [components/modals/CockpitModal.tsx](file:///c:/Users/iaman/carino/components/modals/CockpitModal.tsx) (Bypassed `BannerCropperModal` for GIF files on both tab and modal triggers; upload raw GIF file directly)
  * [components/modals/BannerCropperModal.tsx](file:///c:/Users/iaman/carino/components/modals/BannerCropperModal.tsx) (Defensive passthrough for GIF files to ensure multi-frame GIFs are never canvas-rasterized or converted to JPEG)
  * [app/api/banners/route.ts](file:///c:/Users/iaman/carino/app/api/banners/route.ts) (Preserved `image/gif` content type and `.gif` storage extension, with local storage dev fallback support)
* **Architectural Impact**: Preserves original multi-frame animated GIFs without transcoding. Schema unchanged (`image_url` string). JPG/PNG/WebP cropping behavior retained intact.
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), end-to-end API roundtrip tests (GIF upload, JPG upload, replacements, `image/gif` header verification) all passed.

### 2026-09-19 — Admin Banner Content Management & Dynamic Customization
* **User Intent**: Allow administrators to fully manage all 4 promotional banner slots on the Home dashboard, including image replacement, title, subtitle/description, category/tag, and stats/metadata text. Eliminate hardcoded copy fallbacks while locking the visual design, animations, and aspect ratios.
* **Files Modified**:
  * [app/api/banners/route.ts](file:///c:/Users/iaman/carino/app/api/banners/route.ts) (Enhanced JSON and multipart handlers to merge updates, preserve untouched fields, support clearing optional values, and enforce `requireAdmin`)
  * [components/home/BannerCarousel.tsx](file:///c:/Users/iaman/carino/components/home/BannerCarousel.tsx) (Removed hardcoded copy fallbacks, gracefully omitted empty optional fields, subscribed to `carino:banners-updated` for instant same-session updates)
  * [components/modals/CockpitModal.tsx](file:///c:/Users/iaman/carino/components/modals/CockpitModal.tsx) (Upgraded Banners tab with artwork thumbnails, slot badges, Edit Content button, dedicated Edit Banner modal with inputs for title, category, description, stats, and Change Artwork trigger)
  * [scripts/verify-banner-management.mjs](file:///c:/Users/iaman/carino/scripts/verify-banner-management.mjs) (Automated 10-test suite verifying admin gating, 401/403 security boundaries, single/multi-field edits, empty string clearing, and cross-slot isolation)
* **Architectural Impact**: Persisted `.storage/banners.json` / Supabase covers bucket serves as the single source of truth. Stable slot IDs (1–4) preserved. Zero changes to locked visual design or carousel animations.
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), and automated HTTP test suite (`scripts/verify-banner-management.mjs`) all passed with 0 errors.

### 2026-09-19 — Definitive Circular Playback Queue & Continuous Autoplay Wrap
* **User Intent**: Ensure normal continuous playback and manual Next/Previous navigation treat the playback queue as a dynamic circular queue (`nextIndex = (currentIndex + 1) % queue.length`). When the final track (e.g., track 8 "Kaahe Mose") naturally finishes, normal autoplay immediately transitions to track 1 ("Tulasi") without stopping and without requiring the user to activate repeat-infinite.
* **Files Modified**:
  * [stores/playerStore.ts](file:///c:/Users/iaman/carino/stores/playerStore.ts) (`goToNext` uses `(queueIndex + 1) % queue.length` and `goToPrevious` wraps to `queue.length - 1` unconditionally; sets `seekTarget: 0` for single-track queues)
  * [components/player/AudioEngine.tsx](file:///c:/Users/iaman/carino/components/player/AudioEngine.tsx) (`handleEnded` delegates to `goToNext()` unconditionally for `queue.length > 1`, replays single-track queues smoothly with fade-up, and preserves `mode === 'once'`)
  * [scripts/verify-playback-loop.mjs](file:///c:/Users/iaman/carino/scripts/verify-playback-loop.mjs) (Automated test suite verifying default continuous autoplay wrap, start-at-middle, start-at-last, single-track, 100-track, and 237-track queues)
* **Architectural Impact**: Queue boundary condition resolved at the authoritative store/AudioEngine layer. Zero hardcoded track counts, no duplicate audio elements, no carousel responsibility for playback looping, and full preservation of cross-track fade transitions.
* **Validation**: TypeScript (`npx tsc --noEmit`), ESLint (`npm run lint`), production build (`npm run build`), and automated runtime test suite (`scripts/verify-playback-loop.mjs`).

### 2026-09-19 — Favourite Toggle True Synchronization & Server Persistence
* **User Intent**: Fix the favourite/heart button so it functions as a true toggle (like ↔ unlike) across all three surfaces (MiniPlayer, RightPanel, ExpandedPlayer, and `/favorites`), persists across reload, and prevents race conditions.
* **Files Modified**:
  * [lib/storage/local.ts](file:///c:/Users/iaman/carino/lib/storage/local.ts) (added `getLocalFavorites`, `saveLocalFavorites`, `toggleLocalFavorite`)
  * [app/api/favorites/route.ts](file:///c:/Users/iaman/carino/app/api/favorites/route.ts) (created authenticated `GET`, `POST`, `DELETE` endpoints)
  * [stores/libraryStore.ts](file:///c:/Users/iaman/carino/stores/libraryStore.ts) (added `inFlightFavoriteIds`, `loadFavoritesFromServer`, optimistic rollback)
  * [components/player/MiniPlayer.tsx](file:///c:/Users/iaman/carino/components/player/MiniPlayer.tsx) (subscribed reactively to `favouriteSongIds`)
  * [components/home/RightPanel.tsx](file:///c:/Users/iaman/carino/components/home/RightPanel.tsx) (subscribed reactively to `favouriteSongIds`)
  * [components/player/ExpandedPlayer.tsx](file:///c:/Users/iaman/carino/components/player/ExpandedPlayer.tsx) (subscribed reactively to `favouriteSongIds`)
  * [app/tracks/page.tsx](file:///c:/Users/iaman/carino/app/tracks/page.tsx) (subscribed reactively to `favouriteSongIds`)
  * [components/navigation/TopBar.tsx](file:///c:/Users/iaman/carino/components/navigation/TopBar.tsx) (invoked `loadFavoritesFromServer` on startup)
* **Architectural Impact**: Centralized favourite persistence scoped to authenticated `user.id`.
* **Validation**: Automated suite [scripts/verify-favorites-toggle.mjs](file:///c:/Users/iaman/carino/scripts/verify-favorites-toggle.mjs), TypeScript, ESLint, Next.js production build passed.

### 2026-09-19 — Expanded Player Volume Row Removal
* **User Intent**: Surgically remove the volume slider row from `ExpandedPlayer` while keeping all carousel spacing, layout, and playback logic pixel-identical.
* **Files Modified**: [components/player/ExpandedPlayer.tsx](file:///c:/Users/iaman/carino/components/player/ExpandedPlayer.tsx).
* **Validation**: TypeScript, ESLint, Next.js production build passed.

---

## 9. Current Stable Baseline

| Subsystem | Status | Verification Reference |
|---|---|---|
| **AudioEngine Playback** | **STABLE** | Single physical audio element, smooth fades, zero demo audio |
| **MiniPlayer Bar** | **STABLE** | Play/pause, seek, track metadata, volume, reactive heart toggle |
| **Expanded Player** | **STABLE** | 3D AlbumCarousel, metadata, progress bar, playback controls, like button |
| **Favourite Tracks** | **STABLE** | True toggle (add/remove), server persisted per user, cross-surface sync |
| **Shared Listening Rooms** | **STABLE** | Dual-transport (Supabase Realtime + SSE), drift correction, clean leave |
| **Authentication & RBAC** | **STABLE** | Google/Apple OAuth, dev-mode login fallback, server-enforced role checks |
| **Upload Pipeline / Cockpit** | **STABLE** | Audio/cover file size validation, Supabase Storage + local storage fallback |
| **Design System & Theme** | **STABLE** | DM Sans, dark aesthetic, CSS custom properties, `.vscode/settings.json` ignore |

---

## 10. Validation Matrix

Run the appropriate validation command set based on the files touched:

| Change Scope | Required Validation Commands | Success Criteria |
|---|---|---|
| **Any TypeScript / Component Edit** | `npx tsc --noEmit` | Exit code 0, zero type errors |
| **Lint / Syntax Consistency** | `npm run lint` | Exit code 0, zero ESLint errors |
| **Production Build** | `npm run build` | Turbopack compiles successfully, 31 routes generated |
| **Audio / Playback Changes** | `npm run build` + manual track-switch check in dev server | No audio cut-off, fades execute cleanly, no console errors |
| **Room / Realtime Changes** | `node scripts/test-room-lifecycle-7.mjs` | Multi-client join, broadcast, and leave tests pass |
| **Auth / Permission Changes** | `node scripts/verify-auth-authorization.mjs` | Session validation and admin endpoint protections verified |
| **Favourites Changes** | `node scripts/verify-favorites-toggle.mjs` | Toggle persistence and multi-click spam test pass |

---

## 11. Security-Sensitive Areas

* **Environment Variables**:
  * `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Safe for client-side inclusion.
  * `SUPABASE_SERVICE_ROLE_KEY`: Server-only secret. Must never be imported into client components or prefixed with `NEXT_PUBLIC_`.
  * `ADMIN_EMAIL`: Used as fallback bootstrap check in `lib/auth/server.ts`.
* **API Security Boundaries**:
  * [app/api/admin/](file:///c:/Users/iaman/carino/app/api/admin/): Guarded by `requireAdmin(req)`.
  * [app/api/upload/](file:///c:/Users/iaman/carino/app/api/upload/): Guarded by `requireAuth(req)`.
  * [app/api/account/](file:///c:/Users/iaman/carino/app/api/account/): Users can only read and mutate their own profile (`auth.uid() = id`).
* **Media Proxy Path Traversal**:
  * [app/api/media/route.ts](file:///c:/Users/iaman/carino/app/api/media/route.ts) sanitizes file paths using `path.basename` to prevent directory traversal attacks outside `.storage/`.

---

## 12. Core Data Flows

### 12.1 Playback Flow
```
User clicks Play/Next
  │
  ▼
playerStore.setIsPlaying() / goToNext()
  │
  ▼
AudioEngine receives updated state via usePlayerStore
  │
  ▼
AudioEngine executes fade-down (220ms)
  │
  ▼
authoritativeAudioElement.src = getAudioUrl(...)
  │
  ▼
AudioEngine executes fade-up (450ms) & play()
  │
  ▼
HTMLAudioElement timeupdate periodically updates playerStore.currentTime (250ms throttle)
```

### 12.2 Favourite Toggle Flow
```
User clicks Heart on any surface (MiniPlayer / ExpandedPlayer / RightPanel)
  │
  ▼
libraryStore.toggleFavourite(songId)
  │
  ├─► Check inFlightFavoriteIds (drop click if in-flight to prevent race conditions)
  │
  ├─► 1. Synchronous Optimistic Update: mutate favouriteSongIds & localStorage
  │      └── All components subscribed to favouriteSongIds re-render immediately
  │
  └─► 2. Server Sync: fetch('/api/favorites', { method: 'POST'|'DELETE' })
         ├── If Success: sync authoritative songIds from server response
         └── If Failure: roll back favouriteSongIds & localStorage to previous state
```

### 12.3 Realtime Room Sync Flow
```
Host triggers Play/Pause/Seek
  │
  ▼
roomStore updates local room state
  │
  ▼
roomSync.broadcastRoomAction({ type: 'SEEK', positionMs, ... })
  │
  ├─► Production: Supabase Realtime Channel broadcast
  └─► Dev / Fallback: SSE POST /api/rooms/[id]/events + BroadcastChannel
  │
  ▼
Listener client receives packet in onRemoteMessage
  │
  ▼
Verify sessionEpoch (drop if stale)
  │
  ▼
Check drift against physical AudioEngine (>1.5s seek, >300ms playbackRate adjustment)
```

---

## 13. Rules for Minimal Changes

1. **Solve the specific task requested**: Do not touch code outside the immediate functional requirement.
2. **Never refactor working systems**: If a component or store works as intended, do not restructure it.
3. **Respect protected files**: Do not modify `AudioEngine.tsx`, `playerStore.ts`, or `roomSync.ts` for UI styling tasks.
4. **Avoid duplicate state**: Do not introduce independent `useState` flags for state that already lives in a Zustand store.
5. **Preserve single audio authority**: Never create a secondary `new Audio()` instance.
6. **Preserve exact styling tokens**: Use variables from [app/globals.css](file:///c:/Users/iaman/carino/app/globals.css) rather than hardcoded random hex values.

---

## 14. Change Documentation Protocol

Whenever an AI coding agent completes an architectural, store-level, or behavioral change:
1. Update Section 8 (Recent Change Ledger) with the date, intent, files modified, and validation results.
2. If new files or systems were added, update Section 3 (System Ownership Map) and Section 4 (Routing Map).
3. If new regressions were resolved, document them in Section 7 (Historical Regressions).
4. Run the required checks from Section 10 (Validation Matrix) and include results in the final response.

---

## 15. Unknown / Needs Verification

* **Remote Supabase Storage Cleanup**: Soft-delete vs permanent purge of orphaned audio files when a song is deleted in Supabase production mode requires backend verification with the storage administrator.
* **Apple OAuth Production Service ID**: Apple sign-in provider is stubbed in `authStore.ts` and requires Apple Developer Team IDs in the Supabase Dashboard before production activation.
