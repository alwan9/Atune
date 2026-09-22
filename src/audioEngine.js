/**
 * Aura Music - Audio Engine & Web Audio API Integration
 * Mengelola AudioContext, AnalyserNode (Visualizer), BiquadFilter (Equalizer), dan MediaSession
 */

class AudioEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audioCtx = null;
    this.sourceNode = null;
    this.analyserNode = null;
    this.eqFilters = [];
    this.isInitialized = false;

    // Frekuensi equalizer standar 5-band (Hz)
    this.eqBands = [60, 250, 1000, 4000, 14000];

    // Status Sleep Timer
    this.sleepTimerId = null;
    this.sleepTimerEndTimestamp = null;

    // Callbacks
    this.onTimeUpdate = null;
    this.onTrackEnded = null;
    this.onPlayStateChange = null;

    this.setupAudioListeners();
  }

  initAudioContext() {
    if (this.isInitialized) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      // Buat analyser untuk visualizer spektrum
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 128; // 64 frequency bins untuk visualisasi responsive
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Buat 5 band equalizer
      this.eqFilters = this.eqBands.map((freq, index) => {
        const filter = this.audioCtx.createBiquadFilter();
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === this.eqBands.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = 0; // default flat 0dB
        return filter;
      });

      // Hubungkan audio element -> EQ filters -> Analyser -> Output
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      let prevNode = this.sourceNode;
      for (const filter of this.eqFilters) {
        prevNode.connect(filter);
        prevNode = filter;
      }

      prevNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API init error (mungkin autoplay policy):', e);
    }
  }

  ensureContextResumed() {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setupAudioListeners() {
    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.onTrackEnded) {
        this.onTrackEnded();
      }
    });

    this.audio.addEventListener('play', () => {
      if (this.onPlayStateChange) this.onPlayStateChange(true);
    });

    this.audio.addEventListener('pause', () => {
      if (this.onPlayStateChange) this.onPlayStateChange(false);
    });
  }

  async loadTrack(audioSource, metadata = {}) {
    this.ensureContextResumed();
    if (this.audio.src && this.audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(this.audio.src);
    }
    if (audioSource instanceof Blob) {
      this.audio.src = URL.createObjectURL(audioSource);
    } else if (typeof audioSource === 'string' && audioSource.length > 0) {
      this.audio.src = audioSource;
    }
    this.updateMediaSession(metadata);
  }

  async play() {
    this.ensureContextResumed();
    return await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  seek(seconds) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
  }

  setVolume(val) { // 0 to 1
    this.audio.volume = Math.max(0, Math.min(1, val));
  }

  getVolume() {
    return this.audio.volume;
  }

  setPlaybackRate(rate) { // 0.5 to 2.0
    this.audio.playbackRate = rate;
  }

  // Pengaturan Equalizer
  setEqGain(bandIndex, gainDb) {
    if (this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.value = gainDb;
    }
  }

  applyEqPreset(presetName) {
    const presets = {
      flat: [0, 0, 0, 0, 0],
      bassBoost: [6, 4, 1, 0, 0],
      trebleBoost: [0, 0, 1, 4, 6],
      vocal: [-2, 1, 5, 3, -1],
      rock: [5, 2, -1, 3, 5],
      pop: [3, 2, 4, 2, 1],
      electronic: [6, 4, 0, 2, 5],
    };

    const gains = presets[presetName] || presets.flat;
    gains.forEach((gain, idx) => {
      this.setEqGain(idx, gain);
    });
    return gains;
  }

  // Visualizer spectrum data
  getVisualizerData() {
    if (!this.analyserNode) return null;
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }

  // Sleep Timer
  setSleepTimer(minutes, onTick, onComplete) {
    this.clearSleepTimer();
    if (!minutes || minutes <= 0) return;

    this.sleepTimerEndTimestamp = Date.now() + minutes * 60 * 1000;

    this.sleepTimerId = setInterval(() => {
      const remainingMs = this.sleepTimerEndTimestamp - Date.now();
      if (remainingMs <= 0) {
        this.clearSleepTimer();
        // Fade out volume dalam 3 detik
        this.fadeOutAndPause(3000, () => {
          if (onComplete) onComplete();
        });
      } else {
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        if (onTick) onTick(remainingSeconds);
      }
    }, 1000);
  }

  clearSleepTimer() {
    if (this.sleepTimerId) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
      this.sleepTimerEndTimestamp = null;
    }
  }

  fadeOutAndPause(durationMs, callback) {
    const startVolume = this.audio.volume;
    const interval = 50;
    const step = startVolume / (durationMs / interval);

    const fadeInterval = setInterval(() => {
      if (this.audio.volume > step) {
        this.audio.volume -= step;
      } else {
        this.audio.volume = 0;
        this.pause();
        this.audio.volume = startVolume; // Restore volume setting
        clearInterval(fadeInterval);
        if (callback) callback();
      }
    }, interval);
  }

  // Notifikasi & Lock Screen Controls (MediaSession API)
  updateMediaSession(metadata) {
    if (!('mediaSession' in navigator)) return;

    const artworkList = [];
    if (metadata.coverArtUrl) {
      artworkList.push({ src: metadata.coverArtUrl, sizes: '512x512', type: 'image/jpeg' });
    } else {
      artworkList.push({ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' });
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: metadata.title || 'Unknown Title',
      artist: metadata.artist || 'Unknown Artist',
      album: metadata.album || 'ATune Offline',
      artwork: artworkList
    });
  }

  setupMediaSessionActions(handlers = {}) {
    if (!('mediaSession' in navigator)) return;

    const actions = [
      ['play', handlers.onPlay],
      ['pause', handlers.onPause],
      ['previoustrack', handlers.onPrevious],
      ['nexttrack', handlers.onNext],
      ['seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      }]
    ];

    for (const [action, handler] of actions) {
      try {
        if (handler) {
          navigator.mediaSession.setActionHandler(action, handler);
        }
      } catch (err) {
        console.warn(`Action ${action} tidak didukung:`, err);
      }
    }
  }
}

export const audioEngine = new AudioEngine();
