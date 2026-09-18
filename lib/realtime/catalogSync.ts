'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/songs';
import { useLibraryStore } from '@/stores/libraryStore';
import { usePlayerStore } from '@/stores/playerStore';
import type { Song } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Real-Time Catalog Synchronization Engine
// Uses Supabase Realtime (Broadcast + Postgres Changes) to propagate live catalog
// mutations (ADD, EDIT, DELETE) instantly to all connected authenticated listeners.
// Does NOT touch or interfere with room playback synchronization.
// Realtime carries metadata only — audio bytes remain strictly in private storage.
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogChangeType = 'SONG_ADDED' | 'SONG_UPDATED' | 'SONG_DELETED';

export interface CatalogChangeEvent {
  type: CatalogChangeType;
  song?: Song;
  songId?: string;
  timestamp: number;
}

const CATALOG_CHANNEL_NAME = 'catalog-sync';

/**
 * Broadcasts a catalog mutation event to all active listeners.
 * Called by Admin/Cockpit actions after successful database publication.
 */
export async function broadcastCatalogChange(event: {
  type: CatalogChangeType;
  song?: Song;
  songId?: string;
}): Promise<void> {
  if (typeof window === 'undefined' || !isSupabaseConfigured()) return;

  try {
    const supabase = createClient();
    const channel = supabase.channel(CATALOG_CHANNEL_NAME);
    
    // Subscribe and send
    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'catalog_change',
          payload: {
            ...event,
            timestamp: Date.now(),
          } as CatalogChangeEvent,
        });
      }
    });
  } catch (err) {
    console.warn('[CatalogSync] Broadcast exception:', err);
  }
}

/**
 * Handles incoming catalog change events on any client listener.
 */
export function handleIncomingCatalogEvent(event: CatalogChangeEvent) {
  const library = useLibraryStore.getState();
  const player = usePlayerStore.getState();

  switch (event.type) {
    case 'SONG_ADDED': {
      if (event.song && event.song.id) {
        // Enforce resolved media URLs if missing
        const song = { ...event.song };
        if (!song.audio_url && song.audio_path) {
          song.audio_url = song.audio_path.startsWith('http') || song.audio_path.startsWith('/')
            ? song.audio_path
            : `/api/media?bucket=audio&path=${encodeURIComponent(song.audio_path.replace(/^\/+/, ''))}`;
        }
        if (!song.cover_url && song.cover_path) {
          song.cover_url = song.cover_path.startsWith('http') || song.cover_path.startsWith('/')
            ? song.cover_path
            : `/api/media?bucket=covers&path=${encodeURIComponent(song.cover_path.replace(/^\/+/, ''))}`;
        }
        library.addSong(song);
      }
      break;
    }

    case 'SONG_UPDATED': {
      if (event.song && event.song.id) {
        library.updateSong(event.song.id, event.song);
        // If currently playing the updated song, update currentTrack metadata smoothly
        if (player.currentTrack?.id === event.song.id) {
          player.setCurrentTrack({
            ...player.currentTrack,
            ...event.song,
          });
        }
      }
      break;
    }

    case 'SONG_DELETED': {
      const targetId = event.songId || event.song?.id;
      if (targetId) {
        // 1. Remove from library store
        library.removeSong(targetId);

        // 2. Playback Safety: If the deleted song is currently active, stop and clear gracefully
        if (player.currentTrack?.id === targetId) {
          player.setIsPlaying(false);
          player.setCurrentTrack(null);
          player.setPlaybackError(null);
        }

        // 3. Remove from queue if present
        const currentQueue = player.queue;
        if (currentQueue.some((s) => s.id === targetId)) {
          const updatedQueue = currentQueue.filter((s) => s.id !== targetId);
          player.setQueue(updatedQueue);
        }
      }
      break;
    }
  }
}

/**
 * React Hook: Mounts catalog real-time listener on client components.
 */
export function useCatalogSync() {
  useEffect(() => {
    if (typeof window === 'undefined' || !isSupabaseConfigured()) return;

    const supabase = createClient();
    const channel = supabase.channel(CATALOG_CHANNEL_NAME, {
      config: { broadcast: { self: false } },
    });

    // 1. Listen for Broadcast messages
    channel.on('broadcast', { event: 'catalog_change' }, ({ payload }) => {
      handleIncomingCatalogEvent(payload as CatalogChangeEvent);
    });

    // 2. Listen for Supabase Postgres Changes on 'public.songs' as secondary guarantee
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'songs' },
      (payload) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          handleIncomingCatalogEvent({
            type: 'SONG_ADDED',
            song: payload.new as Song,
            timestamp: Date.now(),
          });
        } else if (payload.eventType === 'UPDATE' && payload.new) {
          handleIncomingCatalogEvent({
            type: 'SONG_UPDATED',
            song: payload.new as Song,
            timestamp: Date.now(),
          });
        } else if (payload.eventType === 'DELETE' && payload.old) {
          handleIncomingCatalogEvent({
            type: 'SONG_DELETED',
            songId: (payload.old as { id?: string }).id || '',
            timestamp: Date.now(),
          });
        }
      }
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Connected to catalog realtime
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
