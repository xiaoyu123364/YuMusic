import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { useSyncExternalStore } from 'react';

import { autoClaimVipBenefits } from '@/features/account/vip-benefits';
import { recordRecentPlay } from '@/features/recent/recent-store';
import { loadLyricLines } from './lyrics';
import { resolveSongSource } from './song-url';
import type { LyricLine, LyricsStatus, PlayMode, PlayerTrack } from './types';

export type PlayerState = {
  queue: PlayerTrack[];
  index: number;
  track: PlayerTrack | null;
  playing: boolean;
  buffering: boolean;
  loading: boolean;
  mode: PlayMode;
  error: string;
  lyrics: LyricLine[];
  lyricsStatus: LyricsStatus;
};

export type ProgressState = {
  positionMs: number;
  durationMs: number;
};

const INITIAL_PLAYER_STATE: PlayerState = {
  queue: [],
  index: -1,
  track: null,
  playing: false,
  buffering: false,
  loading: false,
  mode: 'sequence',
  error: '',
  lyrics: [],
  lyricsStatus: 'idle',
};

const INITIAL_PROGRESS_STATE: ProgressState = {
  positionMs: 0,
  durationMs: 0,
};

function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(partial: Partial<T>) {
      let changed = false;
      for (const key of Object.keys(partial) as (keyof T)[]) {
        if (!Object.is(state[key], partial[key])) {
          changed = true;
          break;
        }
      }

      if (!changed) {
        return;
      }

      state = { ...state, ...partial };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const playerStore = createStore(INITIAL_PLAYER_STATE);
const progressStore = createStore(INITIAL_PROGRESS_STATE);

let audioPlayer: AudioPlayer | null = null;
let switchGeneration = 0;
let failStreak = 0;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;
// 每次“建立新队列”都会自增；后台补齐歌单剩余曲目时靠它判断队列是否已被替换。
let queueGeneration = 0;
// 播放器音量（0-1，作用于当前音频流，独立于系统媒体音量）。
let volumeLevel = 1;

function ensureAudioPlayer(): AudioPlayer {
  if (audioPlayer) {
    return audioPlayer;
  }

  audioPlayer = createAudioPlayer(null, { updateInterval: 500 });
  audioPlayer.volume = volumeLevel;
  audioPlayer.addListener('playbackStatusUpdate', handlePlaybackStatus);
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });

  return audioPlayer;
}

function handlePlaybackStatus(status: AudioStatus) {
  const current = progressStore.getState();
  progressStore.setState({
    positionMs: Math.max(0, Math.round(status.currentTime * 1000)),
    durationMs: status.duration > 0 ? Math.round(status.duration * 1000) : current.durationMs,
  });

  const state = playerStore.getState();
  const playing = status.playing;
  const buffering = status.isBuffering && !status.playing;
  if (state.playing !== playing || state.buffering !== buffering) {
    playerStore.setState({ playing, buffering });
  }

  if (status.didJustFinish) {
    handleTrackFinished();
  }
}

function handleTrackFinished() {
  const { mode, queue } = playerStore.getState();

  if (mode === 'single' || queue.length <= 1) {
    const player = ensureAudioPlayer();
    void player.seekTo(0);
    player.play();
    return;
  }

  void skip(1, true);
}

function pickNextIndex(step: 1 | -1, auto: boolean): number {
  const { queue, index, mode } = playerStore.getState();
  if (!queue.length) {
    return -1;
  }

  if (mode === 'shuffle' && queue.length > 1 && (auto || step === 1)) {
    let candidate = index;
    while (candidate === index) {
      candidate = Math.floor(Math.random() * queue.length);
    }
    return candidate;
  }

  return (index + step + queue.length) % queue.length;
}

async function loadTrackAt(index: number, options?: { autoplay?: boolean; generation?: number }) {
  const { queue } = playerStore.getState();
  const track = queue[index];
  if (!track) {
    return;
  }

  if (advanceTimer) {
    clearTimeout(advanceTimer);
    advanceTimer = null;
  }

  const sequence = options?.generation ?? ++switchGeneration;
  
  // 原子化更新当前歌曲信息与 activeHash
  playerStore.setState({
    index,
    track,
    loading: true,
    error: '',
    lyrics: [],
    lyricsStatus: 'idle',
  });
  progressStore.setState({ positionMs: 0, durationMs: track.durationMs ?? 0 });
  recordRecentPlay(track);

  try {
    const source = await resolveSongSource(track);
    if (sequence !== switchGeneration) {
      return;
    }

    const player = ensureAudioPlayer();
    player.replace({ uri: source.uri });
    // 锁屏/通知栏播控由自定义前台服务 PlaybackService 接管（MediaSessionController
    // 监听 track 变化后调用 moekoeNative.updateMediaSession 启动前台服务，
    // 提供「上一曲/下一曲」并保活后台播放），不再使用 expo-audio 的 Media3 锁屏。
    if (options?.autoplay !== false) {
      player.play();
    }

    failStreak = 0;
    // 解析出最高音质后回填当前曲目元数据，供播放页/歌曲详情展示音质档位与码率。
    playerStore.setState({
      loading: false,
      track: source.qualityLabel
        ? { ...track, qualityLabel: source.qualityLabel, bitRate: source.bitRate }
        : track,
    });
    if (source.durationMs > 0) {
      progressStore.setState({ durationMs: source.durationMs });
    }

  } catch (error) {
    if (sequence !== switchGeneration) {
      return;
    }

    failStreak += 1;
    playerStore.setState({
      loading: false,
      playing: false,
      buffering: false,
      lyricsStatus: 'empty',
      error: error instanceof Error ? error.message : '播放失败，请稍后重试',
    });

    const { queue: currentQueue } = playerStore.getState();
    const maxStreak = Math.min(currentQueue.length, 6);
    if (currentQueue.length > 1 && failStreak < maxStreak) {
      // 遇到无版权或播放失败，平滑自动跳到下一首
      advanceTimer = setTimeout(() => {
        advanceTimer = null;
        void skip(1, true);
      }, 500); // 缩短等待时间，平滑跳过
    }
  }
}

async function loadLyricsFor(track: PlayerTrack, sequence: number) {
  try {
    const lines = await loadLyricLines(track);
    if (sequence !== switchGeneration) {
      return;
    }

    playerStore.setState({
      lyrics: lines,
      lyricsStatus: lines.length ? 'ready' : 'empty',
    });
  } catch {
    if (sequence === switchGeneration) {
      playerStore.setState({ lyrics: [], lyricsStatus: 'empty' });
    }
  }
}

async function skip(step: 1 | -1, auto = false) {
  const sequence = ++switchGeneration;
  const nextIndex = pickNextIndex(step, auto);
  if (nextIndex < 0) {
    return;
  }

  await loadTrackAt(nextIndex, { generation: sequence });
}

/** 当前队列的 generation 是否仍是 expected（供后台补齐判断队列是否已被替换/清空）。 */
export function isCurrentQueueGeneration(expected: number): boolean {
  return expected === queueGeneration;
}

/**
 * 当前播放器（ExoPlayer）的 audioSessionId，供原生 Equalizer 绑定。
 * 尚未开始播放或不可用时返回 0（原生侧退化为全局输出混音 session 0）。
 */
export function getAudioSessionId(): number {
  const id = (audioPlayer as unknown as { audioSessionId?: number } | null)?.audioSessionId;
  return typeof id === 'number' && id > 0 ? id : 0;
}

export const playerActions = {
  async loadLyrics() {
    const { track, lyricsStatus } = playerStore.getState();
    if (!track || lyricsStatus !== 'idle') {
      return;
    }

    const sequence = switchGeneration;
    playerStore.setState({ lyricsStatus: 'loading' });
    await loadLyricsFor(track, sequence);
  },

  /**
   * 用一批曲目建立新队列并从 startIndex 开始播放。
   * 返回本次队列的 generation，供 appendTracks 后台补齐时校验队列未被替换；
   * 无可播曲目时返回 null。
   */
  async playTracks(tracks: PlayerTrack[], startIndex = 0): Promise<number | null> {
    const sequence = ++switchGeneration;
    const playable = tracks.filter((track) => track.hash);
    if (!playable.length) {
      return null;
    }

    // 播放触发静默领取 VIP 权益（幂等），领取后自动刷新音质特权。
    void autoClaimVipBenefits();

    const targetHash = tracks[startIndex]?.hash;
    const index = Math.max(
      0,
      playable.findIndex((track) => track.hash === targetHash)
    );

    // 原子化更新，杜绝中间态
    playerStore.setState({ queue: playable });
    if (sequence !== switchGeneration) return null;

    failStreak = 0;
    const generation = ++queueGeneration;
    await loadTrackAt(index, { generation: sequence });
    return generation;
  },

  /**
   * 把后续分页的曲目追加到当前队列末尾（按 hash 去重）。
   * generation 与当前队列不一致（队列已被替换/清空）时不追加并返回 false。
   */
  appendTracks(tracks: PlayerTrack[], generation: number): boolean {
    if (generation !== queueGeneration) {
      return false;
    }

    const { queue } = playerStore.getState();
    if (!queue.length) {
      return false;
    }

    const seen = new Set(queue.map((track) => track.hash));
    const fresh = tracks.filter((track) => track.hash && !seen.has(track.hash));
    if (fresh.length) {
      playerStore.setState({ queue: [...queue, ...fresh] });
    }

    return true;
  },

  async playTrackNow(track: PlayerTrack) {
    if (!track.hash) {
      return;
    }

    const sequence = ++switchGeneration;
    void autoClaimVipBenefits();

    const { queue, index } = playerStore.getState();
    const existing = queue.findIndex((item) => item.hash === track.hash);
    if (existing >= 0) {
      await loadTrackAt(existing, { generation: sequence });
      return;
    }

    // 插播只是把歌插到当前曲目之后，不改变队列归属：
    // 歌单的后台补齐继续追加到队尾，顺序仍与歌单一致。
    const nextQueue = [...queue];
    nextQueue.splice(index + 1, 0, track);
    failStreak = 0;
    playerStore.setState({ queue: nextQueue });
    
    if (sequence !== switchGeneration) return;
    await loadTrackAt(index + 1, { generation: sequence });
  },

  pause() {
    playerStore.getState().track && audioPlayer?.pause();
  },

  toggle() {
    const { track, playing, loading, error } = playerStore.getState();
    if (!track || loading) {
      return;
    }

    if (error) {
      void loadTrackAt(playerStore.getState().index);
      return;
    }

    const player = ensureAudioPlayer();
    if (playing) {
      player.pause();
      return;
    }

    const { positionMs, durationMs } = progressStore.getState();
    if (durationMs > 0 && positionMs >= durationMs - 300) {
      void player.seekTo(0);
    }
    player.play();
  },

  next() {
    void skip(1);
  },

  previous() {
    void skip(-1);
  },

  /** 设置播放器音量（0-100），作用于当前音频流。 */
  setVolume(percent: number) {
    volumeLevel = Math.min(Math.max(percent, 0), 100) / 100;
    if (audioPlayer) {
      audioPlayer.volume = volumeLevel;
    }
    return Math.round(volumeLevel * 100);
  },

  getVolume(): number {
    return Math.round(volumeLevel * 100);
  },

  seekToMs(positionMs: number) {
    const { track } = playerStore.getState();
    if (!track || !audioPlayer) {
      return;
    }

    const { durationMs } = progressStore.getState();
    const clamped = Math.max(0, durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs);
    progressStore.setState({ positionMs: clamped });
    void audioPlayer.seekTo(clamped / 1000);
  },

  setMode(mode: PlayMode) {
    playerStore.setState({ mode });
  },

  cycleMode() {
    const { mode } = playerStore.getState();
    const order: PlayMode[] = ['sequence', 'shuffle', 'single'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    playerStore.setState({ mode: next });
    return next;
  },

  async jumpTo(index: number) {
    const { queue } = playerStore.getState();
    if (index < 0 || index >= queue.length) {
      return;
    }

    await loadTrackAt(index);
  },

  removeAt(index: number) {
    const { queue, index: currentIndex } = playerStore.getState();
    if (index < 0 || index >= queue.length) {
      return;
    }

    const nextQueue = queue.filter((_, itemIndex) => itemIndex !== index);

    if (!nextQueue.length) {
      playerActions.clearQueue();
      return;
    }

    if (index === currentIndex) {
      playerStore.setState({ queue: nextQueue });
      void loadTrackAt(Math.min(index, nextQueue.length - 1));
      return;
    }

    playerStore.setState({
      queue: nextQueue,
      index: index < currentIndex ? currentIndex - 1 : currentIndex,
    });
  },

  clearQueue() {
    switchGeneration += 1;
    queueGeneration += 1;
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }

    audioPlayer?.pause();
    audioPlayer?.clearLockScreenControls();
    playerStore.setState({
      ...INITIAL_PLAYER_STATE,
      mode: playerStore.getState().mode,
    });
    progressStore.setState(INITIAL_PROGRESS_STATE);
  },
};

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    playerStore.subscribe,
    playerStore.getState,
    playerStore.getInitialState
  );
}

/** 仅订阅“是否有曲目”这一布尔值，供布局类组件使用，避免高频重渲染。 */
export function useHasTrack(): boolean {
  return useSyncExternalStore(
    playerStore.subscribe,
    () => Boolean(playerStore.getState().track),
    () => false
  );
}

export function usePlayerProgress(): ProgressState {
  return useSyncExternalStore(
    progressStore.subscribe,
    progressStore.getState,
    progressStore.getInitialState
  );
}

type ProgressSelection = string | number | boolean | null | undefined;

export function usePlayerProgressSelector<T extends ProgressSelection>(
  selector: (state: ProgressState) => T
): T {
  return useSyncExternalStore(
    progressStore.subscribe,
    () => selector(progressStore.getState()),
    () => selector(progressStore.getInitialState())
  );
}
