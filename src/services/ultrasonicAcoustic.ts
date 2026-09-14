/**
 * ultrasonicAcoustic.ts
 * Smart Attendance System V5.0 - Web Audio API Ultrasonic Beacon & Biometric Confirmation Synthesizer
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Emits an inaudible 18.5 kHz acoustic ultrasonic beacon pulse to verify physical room presence
 */
export function emitUltrasonicChirp(durationSec = 0.15): boolean {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(18500, ctx.currentTime); // 18.5 kHz inaudible classroom frequency

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSec + 0.01);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Plays a pleasant acoustic confirmation chime upon successful biometric liveness & SBT minting
 */
export function playBiometricSuccessChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Harmonic triad: C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz) -> C6 (1046.50 Hz)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = ctx.currentTime + idx * 0.08;
      const noteDuration = 0.28;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + noteDuration + 0.02);
    });
  } catch (e) {
    // Graceful fallback
  }
}

/**
 * Plays an alert tone for anti-spoofing warning or gesture challenge retry
 */
export function playBiometricAlertTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(240, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.20);
  } catch (e) {
    // Graceful fallback
  }
}
