'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/navigation/Sidebar';
import { TopBar } from '@/components/navigation/TopBar';
import { BottomNav } from '@/components/navigation/BottomNav';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { RightPanel } from '@/components/home/RightPanel';
import { AccountModal } from '@/components/modals/AccountModal';
import { CockpitModal } from '@/components/modals/CockpitModal';
import { useRoomStore } from '@/stores/roomStore';
import { useLibraryStore } from '@/stores/libraryStore';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Room Lobby Page
// Matches the deep black Playcloud theme.
// Enables creating or joining a synchronized listening room.
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomLobbyPage() {
  const router = useRouter();
  const userProfile = useLibraryStore((state) => state.userProfile);
  const createRoom = useRoomStore((state) => state.createRoom);
  const joinRoom = useRoomStore((state) => state.joinRoom);
  const isStoreJoining = useRoomStore((state) => state.isJoining);
  const storeJoinError = useRoomStore((state) => state.joinError);
  const setJoinError = useRoomStore((state) => state.setJoinError);

  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [displayName, setDisplayName] = useState(userProfile?.name || 'Anshuman');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = localStorage.getItem('carino_recent_rooms');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setRecentRooms(parsed.slice(0, 4));
        }
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const saveRecentRoom = (code: string) => {
    if (typeof window !== 'undefined') {
      try {
        const updated = Array.from(new Set([code.toUpperCase(), ...recentRooms])).slice(0, 4);
        setRecentRooms(updated);
        localStorage.setItem('carino_recent_rooms', JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  };

  const handleCreateRoom = async () => {
    setIsSubmitting(true);
    setLocalError(null);
    setJoinError(null);

    const name = displayName.trim() || 'Anshuman';
    const result = await createRoom(name);

    setIsSubmitting(false);
    if (result.success && result.room) {
      saveRecentRoom(result.room.room_code);
      router.push(`/room/${result.room.room_code}`);
    } else {
      setLocalError(result.error || 'Failed to create room');
    }
  };

  const handleJoinWithCode = async (codeToJoin?: string) => {
    const code = (codeToJoin || roomCodeInput).trim().toUpperCase();
    if (!code) {
      setLocalError('Please enter a 6-character room code');
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);
    setJoinError(null);

    const name = displayName.trim() || 'Anshuman';
    const result = await joinRoom(code, name);

    setIsSubmitting(false);
    if (result.success && result.room) {
      saveRecentRoom(result.room.room_code);
      router.push(`/room/${result.room.room_code}`);
    } else {
      setLocalError(result.error || `Could not join room "${code}"`);
    }
  };

  const errorMessage = localError || storeJoinError;

  return (
    <>
      <Sidebar />
      <div className="main-area" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar breadcrumb={[{ label: 'Shared Listening Lobby' }]} />

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '40px 32px calc(var(--player-h) + 48px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: '960px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          {/* Header Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              background: 'rgba(236, 72, 153, 0.12)',
              border: '1px solid rgba(236, 72, 153, 0.3)',
              color: '#F472B6',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: '20px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#EC4899',
                boxShadow: '0 0 10px #EC4899',
              }}
            />
            Realtime Synchronized Listening
          </div>

          <h1
            style={{
              fontSize: '32px',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              color: '#FFFFFF',
              textAlign: 'center',
              margin: '0 0 12px 0',
              lineHeight: 1.15,
            }}
          >
            Listen Together In Perfect Sync
          </h1>
          <p
            style={{
              fontSize: '14.5px',
              color: '#8E8E93',
              textAlign: 'center',
              maxWidth: '520px',
              margin: '0 0 36px 0',
              lineHeight: 1.5,
            }}
          >
            Create a private session with your partner or friends. Audio playback, pause,
            seeking, and queue are synchronized in sub-millisecond real-time.
          </p>

          {/* User Display Name Input */}
          <div
            style={{
              width: '100%',
              maxWidth: '440px',
              marginBottom: '32px',
              background: '#111111',
              padding: '14px 18px',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                color: '#FFFFFF',
                flexShrink: 0,
              }}
            >
              {displayName.charAt(0).toUpperCase() || 'A'}
            </div>
            <div style={{ flex: 1 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#636366',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Your Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={30}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginTop: '2px',
                }}
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              style={{
                width: '100%',
                maxWidth: '680px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#F87171',
                fontSize: '13px',
                marginBottom: '24px',
                textAlign: 'center',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Two Action Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
              width: '100%',
              maxWidth: '720px',
              marginBottom: '36px',
            }}
          >
            {/* Card 1: Create a Room */}
            <div
              style={{
                background: '#121214',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '18px',
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'border-color 0.2s ease, transform 0.2s ease',
              }}
            >
              <div>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '18px',
                    fontSize: '20px',
                  }}
                >
                  ✨
                </div>
                <h2
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    margin: '0 0 6px 0',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Create a Room
                </h2>
                <p
                  style={{
                    fontSize: '13px',
                    color: '#8E8E93',
                    lineHeight: 1.45,
                    margin: '0 0 24px 0',
                  }}
                >
                  Start a new shared listening session. You will be assigned a unique
                  6-character room code to share with your partner.
                </p>
              </div>

              <button
                onClick={handleCreateRoom}
                disabled={isSubmitting || isStoreJoining}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '9999px',
                  background: '#FFFFFF',
                  color: '#000000',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: isSubmitting || isStoreJoining ? 'default' : 'pointer',
                  opacity: isSubmitting || isStoreJoining ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(255, 255, 255, 0.2)',
                  transition: 'transform 0.15s ease, opacity 0.15s ease',
                }}
                className="press"
              >
                {isSubmitting || isStoreJoining ? 'Creating...' : 'Create New Room'}
              </button>
            </div>

            {/* Card 2: Join a Room */}
            <div
              style={{
                background: '#121214',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '18px',
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '18px',
                    fontSize: '20px',
                  }}
                >
                  🔗
                </div>
                <h2
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    margin: '0 0 6px 0',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Join a Room
                </h2>
                <p
                  style={{
                    fontSize: '13px',
                    color: '#8E8E93',
                    lineHeight: 1.45,
                    margin: '0 0 16px 0',
                  }}
                >
                  Enter the 6-character room code shared with you to join an active
                  session.
                </p>

                {/* Code Input */}
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => {
                    const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                    setRoomCodeInput(clean);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinWithCode();
                  }}
                  placeholder="e.g. CR7N2K"
                  maxLength={6}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: '#1A1A1E',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    color: '#FFFFFF',
                    fontSize: '16px',
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    textAlign: 'center',
                    outline: 'none',
                    marginBottom: '16px',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                  }}
                />
              </div>

              <button
                onClick={() => handleJoinWithCode()}
                disabled={isSubmitting || isStoreJoining || roomCodeInput.length < 3}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: isSubmitting || isStoreJoining || roomCodeInput.length < 3 ? 'default' : 'pointer',
                  opacity: isSubmitting || isStoreJoining || roomCodeInput.length < 3 ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.15s ease, opacity 0.15s ease',
                }}
                className="press"
              >
                {isSubmitting || isStoreJoining ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          </div>

          {/* Recent Rooms Quick Re-Join */}
          {recentRooms.length > 0 && (
            <div
              style={{
                width: '100%',
                maxWidth: '720px',
                background: '#0D0D0E',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '14px',
                padding: '18px 22px',
              }}
            >
              <h3
                style={{
                  fontSize: '12.5px',
                  fontWeight: 700,
                  color: '#636366',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: '0 0 12px 0',
                }}
              >
                Recent Sessions
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {recentRooms.map((code) => (
                  <button
                    key={code}
                    onClick={() => handleJoinWithCode(code)}
                    disabled={isSubmitting}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: '#18181B',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#FFFFFF',
                      fontSize: '13px',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background 0.15s ease',
                    }}
                    className="press"
                  >
                    <span>Room {code}</span>
                    <span style={{ color: '#8E8E93', fontSize: '11px' }}>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Feature Highlights Footer */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '24px',
              marginTop: '40px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: '24px',
              width: '100%',
              maxWidth: '720px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8E8E93', fontSize: '12px' }}>
              <span style={{ color: '#34D399' }}>✓</span> Sub-millisecond drift correction
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8E8E93', fontSize: '12px' }}>
              <span style={{ color: '#34D399' }}>✓</span> Cross-tab & multi-device sync
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8E8E93', fontSize: '12px' }}>
              <span style={{ color: '#34D399' }}>✓</span> Live partner heartbeat indicator
            </div>
          </div>
        </div>
      </div>
      <RightPanel />
      <MiniPlayer />
      <BottomNav />
      <AccountModal />
      <CockpitModal />
    </>
  );
}
