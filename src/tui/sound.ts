/**
 * Sound effects for tetrio-tui.
 *
 * Plays short generated beeps/tones via macOS `afplay` (or terminal bell as fallback).
 * Gated behind an enabled flag (off by default). Non-blocking — fires and forgets.
 *
 * Different pitches per clear type; combo pitch rises with combo count.
 */
import { execFile } from 'node:child_process';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let _enabled = false;
let _volume = 0.3; // 0.0–1.0

/** Enable or disable sound effects. */
export function setSoundEnabled(v: boolean): void { _enabled = v; }
export function isSoundEnabled(): boolean { return _enabled; }
export function setSoundVolume(v: number): void { _volume = Math.max(0, Math.min(1, v)); }

// ---------------------------------------------------------------------------
// WAV generation — tiny PCM sine-wave generator
// ---------------------------------------------------------------------------

/** Generate a WAV file buffer for a sine tone. */
function generateToneWav(
  frequency: number,
  durationMs: number,
  volume: number = 0.3,
  fadeMs: number = 15,
): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const fadeSamples = Math.floor(sampleRate * fadeMs / 1000);
  const data = Buffer.alloc(numSamples * 2); // 16-bit mono

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = Math.sin(2 * Math.PI * frequency * t) * volume;

    // Fade in
    if (i < fadeSamples) {
      sample *= i / fadeSamples;
    }
    // Fade out
    const fromEnd = numSamples - i;
    if (fromEnd < fadeSamples) {
      sample *= fromEnd / fadeSamples;
    }

    const val = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    data.writeInt16LE(val, i * 2);
  }

  // WAV header (44 bytes) + data
  const wav = Buffer.alloc(44 + data.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + data.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); // chunk size
  wav.writeUInt16LE(1, 20);  // PCM
  wav.writeUInt16LE(1, 22);  // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); // byte rate
  wav.writeUInt16LE(2, 32); // block align
  wav.writeUInt16LE(16, 34); // bits per sample
  wav.write('data', 36);
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);

  return wav;
}

/** Generate a two-tone WAV (attack notification). */
function generateChordWav(
  freq1: number,
  freq2: number,
  durationMs: number,
  volume: number = 0.3,
): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const fadeSamples = Math.floor(sampleRate * 15 / 1000);
  const data = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = (Math.sin(2 * Math.PI * freq1 * t) + Math.sin(2 * Math.PI * freq2 * t)) * volume * 0.5;

    if (i < fadeSamples) sample *= i / fadeSamples;
    const fromEnd = numSamples - i;
    if (fromEnd < fadeSamples) sample *= fromEnd / fadeSamples;

    const val = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    data.writeInt16LE(val, i * 2);
  }

  const wav = Buffer.alloc(44 + data.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + data.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);

  return wav;
}

// ---------------------------------------------------------------------------
// Sound cache — pre-generate common tones to avoid disk thrash
// ---------------------------------------------------------------------------

let _tempDir: string | null = null;
const _cache = new Map<string, string>(); // key → filepath

async function ensureTempDir(): Promise<string> {
  if (!_tempDir) {
    _tempDir = await mkdtemp(join(tmpdir(), 'tetrio-sfx-'));
  }
  return _tempDir;
}

async function getCachedTone(key: string, generator: () => Buffer): Promise<string> {
  const cached = _cache.get(key);
  if (cached) return cached;

  const dir = await ensureTempDir();
  const path = join(dir, `${key}.wav`);
  await writeFile(path, generator());
  _cache.set(key, path);
  return path;
}

// ---------------------------------------------------------------------------
// Playback — non-blocking subprocess
// ---------------------------------------------------------------------------

function playFile(path: string): void {
  try {
    const child = execFile('afplay', ['-v', String(_volume), path], { timeout: 3000 });
    child.unref?.();
    child.on('error', () => {}); // silently ignore
  } catch {
    // afplay not available — use terminal bell as last resort
    process.stdout.write('\x07');
  }
}

// ---------------------------------------------------------------------------
// Public sound effect triggers
// ---------------------------------------------------------------------------

/** Frequency mapping for clear types. */
const CLEAR_FREQS: Record<string, number> = {
  single: 440,   // A4
  double: 523,   // C5
  triple: 659,   // E5
  tetris: 880,   // A5
};

/** Play a line clear sound. Pitch varies by clear type. */
export async function playClear(clearKind: string): Promise<void> {
  if (!_enabled) return;
  const freq = CLEAR_FREQS[clearKind] ?? 440;
  const key = `clear-${clearKind}`;
  const path = await getCachedTone(key, () => generateToneWav(freq, 120, 0.4));
  playFile(path);
}

/** Play a T-spin sound (distinctive two-tone). */
export async function playTSpin(): Promise<void> {
  if (!_enabled) return;
  const key = 'tspin';
  const path = await getCachedTone(key, () => generateChordWav(523, 784, 180, 0.4));
  playFile(path);
}

/** Play a combo sound. Pitch rises with combo count. */
export async function playCombo(combo: number): Promise<void> {
  if (!_enabled) return;
  // Base freq 330Hz (E4), rises ~50Hz per combo, caps at 1200Hz
  const freq = Math.min(1200, 330 + combo * 50);
  const key = `combo-${Math.min(combo, 18)}`; // cache up to 18
  const path = await getCachedTone(key, () => generateToneWav(freq, 80, 0.35));
  playFile(path);
}

/** Play a hard drop thud. */
export async function playHardDrop(): Promise<void> {
  if (!_enabled) return;
  const key = 'harddrop';
  const path = await getCachedTone(key, () => generateToneWav(110, 60, 0.5, 5));
  playFile(path);
}

/** Play an all-clear fanfare (ascending chord). */
export async function playAllClear(): Promise<void> {
  if (!_enabled) return;
  const key = 'allclear';
  const path = await getCachedTone(key, () => generateChordWav(523, 1047, 300, 0.5));
  playFile(path);
}

/** Play a level-up / B2B sound. */
export async function playB2B(): Promise<void> {
  if (!_enabled) return;
  const key = 'b2b';
  const path = await getCachedTone(key, () => generateChordWav(659, 880, 150, 0.35));
  playFile(path);
}

/** Clean up temp files on exit. */
export async function cleanupSounds(): Promise<void> {
  for (const path of _cache.values()) {
    try { await unlink(path); } catch { /* ignore */ }
  }
  _cache.clear();
  _tempDir = null;
}
