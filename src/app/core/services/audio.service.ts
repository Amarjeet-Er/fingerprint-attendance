import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private audioCtx: AudioContext | null = null;
  private isMuted = false;
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      this.isMuted = localStorage.getItem('marfo-audio-muted') === 'true';
    }
  }

  get muted(): boolean {
    return this.isMuted;
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isBrowser) {
      localStorage.setItem('marfo-audio-muted', String(this.isMuted));
    }
    if (!this.isMuted) {
      this.playBeep(880, 0.08, 'sine');
    }
    return this.isMuted;
  }

  private initContext(): AudioContext | null {
    if (!this.isBrowser) return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /** Device Connected Chime: Modern futuristic 4-note ascending chord */
  playConnect(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const now = ctx.currentTime;

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.07);

      gain.gain.setValueAtTime(0, now + index * 0.07);
      gain.gain.linearRampToValueAtTime(0.25, now + index * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.07 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.07);
      osc.stop(now + index * 0.07 + 0.4);
    });
  }

  /** Device Disconnected Tone: Soft descending alert */
  playDisconnect(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const notes = [587.33, 440.00]; // D5 -> A4
    const now = ctx.currentTime;

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + index * 0.12);

      gain.gain.setValueAtTime(0, now + index * 0.12);
      gain.gain.linearRampToValueAtTime(0.2, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.12 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.32);
    });
  }

  /** Biometric Scan Pulse: High-tech laser chirp */
  playScan(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** Fingerprint Match Success Chime: Upbeat bright major chime */
  playSuccess(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [659.25, 880.00, 1174.66]; // E5, A5, D6

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.22, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.5);
    });
  }

  /** Fingerprint Not Matched / Error Buzz: Soft low double buzz */
  playError(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [0, 0.14].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now + offset);

      gain.gain.setValueAtTime(0.16, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.11);
    });
  }

  /** Check In recorded */
  playCheckIn(): void {
    this.playSuccess();
  }

  /** Check Out recorded */
  playCheckOut(): void {
    if (this.isMuted) return;
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [880.00, 659.25]; // A5 -> E5
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);

      gain.gain.setValueAtTime(0.2, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.38);
    });
  }

  private playBeep(freq: number, duration: number, type: OscillatorType = 'sine'): void {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
