'use client';

import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { useLibraryStore } from '@/stores/libraryStore';
import { getAudioUrl, getCoverUrl } from '@/lib/supabase/storage';

// ─────────────────────────────────────────────────────────────────────────────
// CARIÑO — Single Authoritative Audio Engine with Safe Volume Fade Transitions
// Maintains exactly ONE HTMLAudioElement for the entire application lifetime.
// The fade is strictly an audio-volume effect surrounding the authoritative core:
//   A) Track Source Synchronization (Authoritative track-switch + safe volume envelope)
//   B) Play/Pause State Synchronization (Authoritative user play/pause toggles)
//   C) Volume, Mute, Seek & Rate Synchronization (Dynamic logical volume targets)
//   D) Audio Event Reporting & Lifecycle (Single listener initialization)
// ─────────────────────────────────────────────────────────────────────────────

let authoritativeAudioElement: HTMLAudioElement | null = null;

const FADE_DOWN_MS = 220;       // Smooth short fade-out on manual track switch (200-250ms)
const FADE_UP_MS = 450;         // Cinematic fade-in on newly loaded track (400-500ms)
const END_FADE_SECONDS = 0.75;   // Natural end-of-track fade-out window

/**
 * Animates HTMLAudioElement volume smoothly without mutating stored user volume.
 * Supports dynamic target retrieval (e.g. if the user changes volume mid-fade).
 */
function fadeAudioVolume(
  audio: HTMLAudioElement,
  fromVolume: number,
  targetVolumeGetter: () => number,
  durationMs: number,
  isValid: () => boolean,
  onComplete?: () => void
): () => void {
  // If document is hidden/backgrounded, requestAnimationFrame is suspended/throttled by browsers.
  // Immediately apply target volume without scheduling rAF so background audio transitions remain audible.
  if (typeof document !== 'undefined' && document.hidden) {
    if (isValid()) {
      const target = Math.max(0, Math.min(1, targetVolumeGetter()));
      audio.volume = target;
      if (onComplete) {
        onComplete();
      }
    }
    return () => {};
  }

  let animFrameId: number | null = null;
  const startTime = performance.now();
  const startVol = Math.max(0, Math.min(1, fromVolume));

  const tick = (now: number) => {
    if (!isValid()) {
      return;
    }

    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    // Cubic ease-out: smooth deceleration
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const currentTarget = Math.max(0, Math.min(1, targetVolumeGetter()));

    const currentVolume = startVol + (currentTarget - startVol) * easedProgress;
    audio.volume = Math.max(0, Math.min(1, currentVolume));

    if (progress < 1) {
      animFrameId = requestAnimationFrame(tick);
    } else {
      audio.volume = currentTarget;
      if (onComplete && isValid()) {
        onComplete();
      }
    }
  };

  animFrameId = requestAnimationFrame(tick);

  return () => {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };
}

export function getAuthoritativeAudio(): HTMLAudioElement | null {
  return authoritativeAudioElement;
}

/**
 * Detailed Diagnostic Logger for Audio & Synchronization Pipeline
 */
export function logAudioDiagnostic(
  label: string,
  audio: HTMLAudioElement | null,
  extra?: Record<string, unknown>
) {
  if (!audio) {
    console.warn(`[AudioDiagnostic] ${label}: audio is null`, extra);
    return;
  }
  const track = usePlayerStore.getState().currentTrack;
  const diagnostic = {
    diagnosticLabel: label,
    eventType: extra?.eventType ?? 'N/A',
    trackId: track?.id ?? 'none',
    currentTrackTitle: track ? `${track.title} - ${track.artist}` : 'none',
    'audio.src': audio.src || 'none',
    'audio.currentSrc': audio.currentSrc || 'none',
    'audio.readyState': audio.readyState,
    'audio.networkState': audio.networkState,
    'audio.paused': audio.paused,
    'audio.ended': audio.ended,
    'audio.currentTime': audio.currentTime,
    'audio.duration': audio.duration,
    'document.visibilityState': typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    hasLoadedMetadata: audio.readyState >= 1,
    playAttempted: extra?.playAttempted ?? false,
    playPromiseStatus: extra?.playPromiseStatus ?? 'N/A',
    rejectionName: extra?.rejectionName ?? null,
    rejectionMessage: extra?.rejectionMessage ?? null,
    'audio.error?.code': audio.error?.code ?? null,
    'audio.error?.message': audio.error?.message ?? null,
    userActivationActive:
      typeof navigator !== 'undefined' && 'userActivation' in navigator
        ? (navigator as unknown as { userActivation: { isActive: boolean; hasBeenActive: boolean } }).userActivation?.isActive
        : 'unknown',
    userActivationHasBeenActive:
      typeof navigator !== 'undefined' && 'userActivation' in navigator
        ? (navigator as unknown as { userActivation: { isActive: boolean; hasBeenActive: boolean } }).userActivation?.hasBeenActive
        : 'unknown',
    ...extra,
  };
  console.log(`[AudioDiagnostic] === ${label} ===`, JSON.stringify(diagnostic, null, 2));
  return diagnostic;
}

/**
 * Unlocks the single authoritative audio element inside a valid user gesture.
 * Complies strictly with browser autoplay policies without hacks or secondary elements.
 */
export async function unlockAuthoritativeAudio(targetPositionSeconds?: number): Promise<boolean> {
  const audio = authoritativeAudioElement;
  if (!audio) {
    console.warn('[AudioUnlock] Global audio element not available');
    return false;
  }

  logAudioDiagnostic('AUDIO_UNLOCK_ATTEMPT', audio, {
    playAttempted: true,
    targetPositionSeconds,
  });

  try {
    const currentTrack = usePlayerStore.getState().currentTrack;
    if (currentTrack) {
      const rawSrc = currentTrack.audio_url || currentTrack.audio_path;
      const resolvedUrl = getAudioUrl(rawSrc);
      const fullUrl =
        resolvedUrl.startsWith('http://') ||
        resolvedUrl.startsWith('https://') ||
        resolvedUrl.startsWith('blob:')
          ? resolvedUrl
          : `${window.location.origin}${resolvedUrl}`;
      if (audio.src !== fullUrl) {
        audio.src = fullUrl;
      }
    }

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
    }

    usePlayerStore.getState().setIsAudioUnlocked(true);
    usePlayerStore.getState().setNeedsAudioUnlock(false);
    usePlayerStore.getState().setAudioPaused(audio.paused);

    if (targetPositionSeconds !== undefined && !isNaN(targetPositionSeconds) && targetPositionSeconds >= 0) {
      audio.currentTime = targetPositionSeconds;
      usePlayerStore.getState().setCurrentTime(targetPositionSeconds);
    }

    const isPlaying = usePlayerStore.getState().isPlaying;
    if (!isPlaying) {
      audio.pause();
      usePlayerStore.getState().setAudioPaused(true);
    } else {
      usePlayerStore.getState().setAudioPaused(false);
    }

    logAudioDiagnostic('AUDIO_UNLOCK_SUCCESS', audio, {
      playPromiseStatus: 'resolved',
      targetPositionSeconds,
      isPlaying,
    });

    return true;
  } catch (err) {
    const isAutoplay =
      err instanceof Error &&
      (err.name === 'NotAllowedError' || err.message.toLowerCase().includes('interact'));

    logAudioDiagnostic('AUDIO_UNLOCK_FAILED', audio, {
      playPromiseStatus: 'rejected',
      rejectionName: err instanceof Error ? err.name : 'UnknownError',
      rejectionMessage: err instanceof Error ? err.message : String(err),
      isAutoplay,
    });

    if (isAutoplay) {
      usePlayerStore.getState().setNeedsAudioUnlock(true);
      usePlayerStore.getState().setIsAudioUnlocked(false);
      usePlayerStore.getState().setSyncStatus('audio-locked');
    }

    return false;
  }
}

export function AudioEngine() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Store subscriptions
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const queueIndex = usePlayerStore((state) => state.queueIndex);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const volume = usePlayerStore((state) => state.volume);
  const muted = usePlayerStore((state) => state.muted);
  const seekTarget = usePlayerStore((state) => state.seekTarget);
  const playbackRate = usePlayerStore((state) => state.playbackRate);

  // Store actions
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setIsBuffering = usePlayerStore((state) => state.setIsBuffering);
  const clearSeekTarget = usePlayerStore((state) => state.clearSeekTarget);
  const setPlaybackError = usePlayerStore((state) => state.setPlaybackError);
  const setAudioPaused = usePlayerStore((state) => state.setAudioPaused);
  const setIsAudioUnlocked = usePlayerStore((state) => state.setIsAudioUnlocked);
  const setNeedsAudioUnlock = usePlayerStore((state) => state.setNeedsAudioUnlock);
  const goToNext = usePlayerStore((state) => state.goToNext);
  const goToPrevious = usePlayerStore((state) => state.goToPrevious);
  const seekTo = usePlayerStore((state) => state.seekTo);

  // Synchronization and fade tracking refs
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const currentTrackIdRef = useRef<string | null>(null);
  const currentQueueIndexRef = useRef<number | null>(null);
  const switchTokenRef = useRef(0);
  const isSwitchingTrackRef = useRef(false);
  const isFadingRef = useRef(false);
  const endFadeStartedRef = useRef(false);
  const expectedSrcRef = useRef<string>('');
  const activeFadeCancelRef = useRef<(() => void) | null>(null);

  const cancelActiveFade = () => {
    if (activeFadeCancelRef.current) {
      activeFadeCancelRef.current();
      activeFadeCancelRef.current = null;
    }
    isFadingRef.current = false;
  };

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // ─────────────────────────────────────────────────────────────────────────────
  // D) AUDIO EVENT REPORTING & AUTHORITATIVE LIFECYCLE
  // Single HTMLAudioElement initialized once on mount
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;
    authoritativeAudioElement = audio;

    const handleLoadStart = () => {
      setIsBuffering(true);
      setPlaybackError(null);
      logAudioDiagnostic('LOAD_START', audio);
    };

    const handleLoadedMetadata = () => {
      const dur = audio.duration;
      if (!isNaN(dur) && dur > 0) {
        setDuration(Math.round(dur));
      }
      logAudioDiagnostic('LOADED_METADATA', audio, { duration: dur });
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
    };

    const handlePlay = () => {
      setAudioPaused(false);
      setIsAudioUnlocked(true);
      setNeedsAudioUnlock(false);
      setPlaybackError(null);
      logAudioDiagnostic('ON_PLAY', audio);
      const current = usePlayerStore.getState().currentTrack;
      if (current) {
        useLibraryStore.getState().addToRecentlyPlayed(current);
      }
    };

    const handlePlaying = () => {
      setAudioPaused(false);
      setIsBuffering(false);
    };

    const handlePause = () => {
      setAudioPaused(true);
      logAudioDiagnostic('ON_PAUSE', audio);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleStalled = () => {
      console.warn('[AudioEngine] Playback stalled on network stream');
    };

    const handleTimeUpdate = () => {
      if (!isNaN(audio.currentTime)) {
        setCurrentTime(audio.currentTime);
      }
      setAudioPaused(audio.paused);

      // Natural end-of-track fade: begin fading down during final ~750ms
      const remaining = audio.duration - audio.currentTime;
      if (
        usePlayerStore.getState().isPlaying &&
        Number.isFinite(remaining) &&
        remaining > 0 &&
        remaining <= END_FADE_SECONDS &&
        !endFadeStartedRef.current &&
        !isSwitchingTrackRef.current
      ) {
        endFadeStartedRef.current = true;
        isFadingRef.current = true;
        const currentFadeToken = switchTokenRef.current;
        activeFadeCancelRef.current = fadeAudioVolume(
          audio,
          audio.volume,
          () => 0,
          Math.max(100, Math.round(remaining * 1000)),
          () => currentFadeToken === switchTokenRef.current
        );
      }

      // Verify ground truth for collaborative rooms
      const player = usePlayerStore.getState();
      if (player.roomId && player.isPlaying && audio.paused) {
        if (!player.isAudioUnlocked) {
          player.setSyncStatus('audio-locked');
        }
      }
    };

    const handleEnded = () => {
      endFadeStartedRef.current = false;
      cancelActiveFade();

      const player = usePlayerStore.getState();
      const mode = player.repeatMode;

      if (mode === 'once') {
        audio.currentTime = 0;
        audio.volume = 0;
        isFadingRef.current = true;
        const token = switchTokenRef.current;
        audio.play().then(() => {
          activeFadeCancelRef.current = fadeAudioVolume(
            audio,
            0,
            () => volumeRef.current,
            FADE_UP_MS,
            () => token === switchTokenRef.current,
            () => {
              isFadingRef.current = false;
              audio.volume = Math.max(0, Math.min(1, volumeRef.current));
            }
          );
        }).catch((err) => {
          console.warn('[AudioEngine] Repeat once play failed:', err);
          audio.volume = Math.max(0, Math.min(1, volumeRef.current));
          isFadingRef.current = false;
        });
        usePlayerStore.getState().setRepeatMode('off');
        return;
      }

      if (player.queue.length <= 1) {
        if (player.queue.length === 1) {
          audio.currentTime = 0;
          audio.volume = 0;
          isFadingRef.current = true;
          const token = switchTokenRef.current;
          audio.play().then(() => {
            activeFadeCancelRef.current = fadeAudioVolume(
              audio,
              0,
              () => volumeRef.current,
              FADE_UP_MS,
              () => token === switchTokenRef.current,
              () => {
                isFadingRef.current = false;
                audio.volume = Math.max(0, Math.min(1, volumeRef.current));
              }
            );
          }).catch((err) => {
            console.warn('[AudioEngine] Single-track continuous play failed:', err);
            audio.volume = Math.max(0, Math.min(1, volumeRef.current));
            isFadingRef.current = false;
          });
          return;
        }
        audio.volume = Math.max(0, Math.min(1, volumeRef.current));
        setIsPlaying(false);
        setAudioPaused(true);
        return;
      }

      // Normal continuous playback: circular queue wrap (1 -> 2 -> ... -> N -> 1)
      goToNext();
    };

    const handleError = () => {
      const err = audio.error;

      // Ignore expected source-switch aborts or errors from obsolete sources
      const isExpectedAbort =
        isSwitchingTrackRef.current ||
        err?.code === MediaError.MEDIA_ERR_ABORTED ||
        (expectedSrcRef.current !== '' && audio.src !== expectedSrcRef.current);

      if (isExpectedAbort) {
        logAudioDiagnostic('AUDIO_ABORTED_EXPECTED', audio, {
          eventType: 'error',
          codeName: 'MEDIA_ERR_ABORTED',
          message: 'Expected abort or obsolete source error during switch, ignoring.',
        });
        return;
      }

      let errMsg = 'Playback error';
      let codeName = 'UNKNOWN';
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            errMsg = 'Network error downloading audio';
            codeName = 'MEDIA_ERR_NETWORK';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errMsg = 'Audio decoding error';
            codeName = 'MEDIA_ERR_DECODE';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errMsg = 'Audio format or storage path not supported';
            codeName = 'MEDIA_ERR_SRC_NOT_SUPPORTED';
            break;
          default:
            errMsg = err.message || 'Unknown media error';
            codeName = `MEDIA_ERR_${err.code}`;
        }
      }

      logAudioDiagnostic('AUDIO_ERROR', audio, {
        codeName,
        errorMessage: errMsg,
      });

      cancelActiveFade();
      audio.volume = Math.max(0, Math.min(1, volumeRef.current));
      setIsPlaying(false);
      setAudioPaused(true);
      setIsBuffering(false);
      setPlaybackError(errMsg);
    };

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      switchTokenRef.current += 1;
      cancelActiveFade();
      isSwitchingTrackRef.current = false;
      audio.pause();
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      audioRef.current = null;
      authoritativeAudioElement = null;
    };
  }, [
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setIsBuffering,
    setPlaybackError,
    setAudioPaused,
    setIsAudioUnlocked,
    setNeedsAudioUnlock,
    goToNext,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // A) TRACK SOURCE SYNCHRONIZATION
  // Authoritative track switch surrounded by safe, non-blocking volume envelope.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      currentTrackIdRef.current = null;
      currentQueueIndexRef.current = null;
      expectedSrcRef.current = '';
      isSwitchingTrackRef.current = false;
      cancelActiveFade();
      switchTokenRef.current += 1;
      audio.pause();
      audio.src = '';
      setAudioPaused(true);
      return;
    }

    // Only proceed if track identity or queue index changed
    if (currentTrack.id === currentTrackIdRef.current && queueIndex === currentQueueIndexRef.current) {
      return;
    }

    currentTrackIdRef.current = currentTrack.id;
    currentQueueIndexRef.current = queueIndex;
    const token = ++switchTokenRef.current;
    isSwitchingTrackRef.current = true;
    endFadeStartedRef.current = false;
    cancelActiveFade();

    const trackToLoad = currentTrack;
    // Determine whether a fade-down is beneficial (audio was playing audibly)
    const shouldFadeDown = Boolean(usePlayerStore.getState().isPlaying && !audio.paused && audio.src && audio.volume > 0.05);

    const executeSwitch = () => {
      if (token !== switchTokenRef.current) return;

      // 1. Invalidate previous playback / pause
      audio.pause();

      // 2. Resolve new source URL
      const rawSrc = trackToLoad.audio_url || trackToLoad.audio_path;
      const resolvedUrl = getAudioUrl(rawSrc);

      if (!resolvedUrl) {
        console.warn('[AudioEngine] No valid audio URL for track:', trackToLoad.title);
        setPlaybackError('No audio URL found');
        isSwitchingTrackRef.current = false;
        isFadingRef.current = false;
        return;
      }

      const fullUrl =
        resolvedUrl.startsWith('http://') ||
        resolvedUrl.startsWith('https://') ||
        resolvedUrl.startsWith('blob:')
          ? resolvedUrl
          : `${window.location.origin}${resolvedUrl}`;

      expectedSrcRef.current = fullUrl;

      // 3. Set the new audio.src & load
      audio.src = fullUrl;
      audio.load();

      // 4. Reset currentTime = 0
      try {
        audio.currentTime = 0;
      } catch {
        // Ignored if readyState doesn't support setting currentTime yet
      }
      setCurrentTime(0);

      if (trackToLoad.duration_seconds > 0) {
        setDuration(trackToLoad.duration_seconds);
      }

      // 5. Check if playerStore indicates isPlaying
      const shouldPlay = usePlayerStore.getState().isPlaying;

      if (!shouldPlay) {
        // Paused track: restore logical volume preference and remain paused
        audio.volume = Math.max(0, Math.min(1, volumeRef.current));
        audio.muted = mutedRef.current;
        isSwitchingTrackRef.current = false;
        isFadingRef.current = false;
        setAudioPaused(true);
        return;
      }

      // 6. Playing track: start at silence and fade UP to logical volume preference
      audio.volume = 0;
      audio.muted = mutedRef.current;
      isFadingRef.current = true;

      logAudioDiagnostic('TRACK_SWITCH_PLAY_FADE_UP', audio, {
        token,
        trackTitle: trackToLoad.title,
        src: fullUrl,
        targetVolume: volumeRef.current,
      });

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (token !== switchTokenRef.current) return;
            isSwitchingTrackRef.current = false;
            setIsAudioUnlocked(true);
            setNeedsAudioUnlock(false);
            setAudioPaused(false);
            logAudioDiagnostic('TRACK_SWITCH_PLAY_RESOLVED', audio, { token });

            // Smooth fade-up to user's volume preference
            activeFadeCancelRef.current = fadeAudioVolume(
              audio,
              0,
              () => volumeRef.current,
              FADE_UP_MS,
              () => token === switchTokenRef.current,
              () => {
                if (token === switchTokenRef.current) {
                  isFadingRef.current = false;
                  audio.volume = Math.max(0, Math.min(1, volumeRef.current));
                }
              }
            );
          })
          .catch((err: unknown) => {
            if (token !== switchTokenRef.current) return;
            isSwitchingTrackRef.current = false;
            isFadingRef.current = false;
            audio.volume = Math.max(0, Math.min(1, volumeRef.current));

            if (err instanceof Error && err.name === 'AbortError') {
              // Aborted by subsequent track switch or pause — ignore
              return;
            }

            const isAutoplayBlocked =
              err instanceof Error &&
              (err.name === 'NotAllowedError' ||
                err.message.toLowerCase().includes('user gesture') ||
                err.message.toLowerCase().includes('interact'));

            logAudioDiagnostic('TRACK_SWITCH_PLAY_REJECTED', audio, {
              token,
              isAutoplayBlocked,
              error: err instanceof Error ? err.message : String(err),
            });

            setAudioPaused(true);

            if (isAutoplayBlocked) {
              setNeedsAudioUnlock(true);
              setIsAudioUnlocked(false);
              usePlayerStore.getState().setSyncStatus('audio-locked');
            } else {
              setIsPlaying(false);
              setPlaybackError(err instanceof Error ? err.message : 'Play request failed');
            }
          });
      } else {
        isSwitchingTrackRef.current = false;
      }
    };

    if (shouldFadeDown) {
      isFadingRef.current = true;
      const initialVol = audio.volume;
      const duration = Math.max(100, Math.round(FADE_DOWN_MS * (initialVol / Math.max(0.1, volumeRef.current))));
      activeFadeCancelRef.current = fadeAudioVolume(
        audio,
        initialVol,
        () => 0,
        duration,
        () => token === switchTokenRef.current,
        () => {
          executeSwitch();
        }
      );
    } else {
      executeSwitch();
    }
  }, [
    currentTrack,
    queueIndex,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setPlaybackError,
    setAudioPaused,
    setIsAudioUnlocked,
    setNeedsAudioUnlock,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // B) PLAY / PAUSE SYNCHRONIZATION
  // Handles user-initiated play / pause toggles on the currently active track.
  // Ignored while a track switch is in progress to prevent feedback loops.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    // Track switch effect handles the initial play/pause for new tracks
    if (isSwitchingTrackRef.current) return;

    if (isPlaying) {
      if (audio.paused) {
        logAudioDiagnostic('PLAY_INVOCATION', audio);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsAudioUnlocked(true);
              setNeedsAudioUnlock(false);
              setAudioPaused(false);
            })
            .catch((err: unknown) => {
              if (err instanceof Error && err.name === 'AbortError') return;

              const isAutoplayBlocked =
                err instanceof Error &&
                (err.name === 'NotAllowedError' ||
                  err.message.toLowerCase().includes('user gesture') ||
                  err.message.toLowerCase().includes('interact'));

              setAudioPaused(true);

              if (isAutoplayBlocked) {
                setNeedsAudioUnlock(true);
                setIsAudioUnlocked(false);
                usePlayerStore.getState().setSyncStatus('audio-locked');
              } else {
                setIsPlaying(false);
                setPlaybackError(err instanceof Error ? err.message : 'Play request failed');
              }
            });
        }
      }
    } else {
      if (!audio.paused) {
        logAudioDiagnostic('PAUSE_INVOCATION', audio);
        cancelActiveFade();
        isFadingRef.current = false;
        audio.pause();
        setAudioPaused(true);
      }
    }
  }, [isPlaying, setIsPlaying, setAudioPaused, setIsAudioUnlocked, setNeedsAudioUnlock, setPlaybackError]);

  // ─────────────────────────────────────────────────────────────────────────────
  // C) VOLUME, MUTE, SEEK & PLAYBACK RATE SYNCHRONIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const clamped = Math.max(0, Math.min(1, volume));
    volumeRef.current = clamped;
    // When a fade is active, the fade animation reads volumeRef.current dynamically.
    // When no fade is active, synchronize directly to the audio element.
    if (!isFadingRef.current) {
      audio.volume = clamped;
    }
    audio.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    if (seekTarget === null) return;
    const audio = audioRef.current;
    if (audio && !isNaN(seekTarget)) {
      try {
        audio.currentTime = seekTarget;
      } catch (err) {
        console.warn('[AudioEngine] Seek error:', err);
      }
    }
    clearSeekTarget();
  }, [seekTarget, clearSeekTarget]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const safeRate = Math.max(0.5, Math.min(2.0, playbackRate || 1.0));
    if (audio.playbackRate !== safeRate) {
      audio.playbackRate = safeRate;
    }
  }, [playbackRate]);

  // ─────────────────────────────────────────────────────────────────────────────
  // E) WEB MEDIA SESSION INTEGRATION
  // Synchronizes playbackState, track metadata, and lock-screen / OS controls
  // with the existing single authoritative HTMLAudioElement and playerStore.
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const rawCover = currentTrack.cover_url || currentTrack.cover_path;
    const coverUrl = getCoverUrl(rawCover);
    const fullArtworkUrl =
      coverUrl.startsWith('http://') ||
      coverUrl.startsWith('https://') ||
      coverUrl.startsWith('blob:') ||
      coverUrl.startsWith('data:')
        ? coverUrl
        : `${window.location.origin}${coverUrl}`;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || 'Unknown Track',
        artist: currentTrack.artist || 'Cariño',
        album: currentTrack.album || 'Cariño',
        artwork: [
          { src: fullArtworkUrl, sizes: '96x96' },
          { src: fullArtworkUrl, sizes: '128x128' },
          { src: fullArtworkUrl, sizes: '192x192' },
          { src: fullArtworkUrl, sizes: '256x256' },
          { src: fullArtworkUrl, sizes: '384x384' },
          { src: fullArtworkUrl, sizes: '512x512' },
        ],
      });
    } catch (err) {
      console.warn('[AudioEngine] MediaMetadata update error:', err);
    }
  }, [currentTrack]);

  // Synchronize Media Session playbackState strictly from actual playback state
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    if (!currentTrack) {
      navigator.mediaSession.playbackState = 'none';
    } else {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [currentTrack, isPlaying]);

  // Register Media Session OS action handlers routing directly to existing actions
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) {
      return;
    }

    const setAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignored if action is not supported by current browser
      }
    };

    setAction('play', () => {
      setIsPlaying(true);
    });

    setAction('pause', () => {
      setIsPlaying(false);
    });

    setAction('previoustrack', () => {
      goToPrevious();
    });

    setAction('nexttrack', () => {
      goToNext();
    });

    setAction('seekbackward', (details) => {
      const audio = audioRef.current;
      const skipSec = details.seekOffset || 10;
      const cur = audio ? audio.currentTime : usePlayerStore.getState().currentTime;
      seekTo(Math.max(0, cur - skipSec));
    });

    setAction('seekforward', (details) => {
      const audio = audioRef.current;
      const skipSec = details.seekOffset || 10;
      const cur = audio ? audio.currentTime : usePlayerStore.getState().currentTime;
      const dur = audio && !isNaN(audio.duration) && audio.duration > 0
        ? audio.duration
        : usePlayerStore.getState().duration;
      const maxTime = dur > 0 ? dur : cur + skipSec;
      seekTo(Math.min(maxTime, cur + skipSec));
    });

    setAction('seekto', (details) => {
      if (details.seekTime !== undefined && details.seekTime !== null && !isNaN(details.seekTime)) {
        seekTo(Math.max(0, details.seekTime));
      }
    });

    return () => {
      setAction('play', null);
      setAction('pause', null);
      setAction('previoustrack', null);
      setAction('nexttrack', null);
      setAction('seekbackward', null);
      setAction('seekforward', null);
      setAction('seekto', null);
    };
  }, [setIsPlaying, goToPrevious, goToNext, seekTo]);

  return null;
}
