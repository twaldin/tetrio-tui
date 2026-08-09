/**
 * Render preferences — module singleton (same pattern as themes/pieceStyles).
 *
 * Wired from the persisted config in main.ts applyConfig(); read in hot
 * render paths. Two independent switches:
 *
 *  - effectsEnabled (video.effects): board shake, line-clear flash/sweep,
 *    particles, attack popups. Off = calm board but big text still shows.
 *  - minimalMode (video.minimal): strip EVERYTHING decorative — no big ASCII
 *    text, no shake, no particles, no sweep, no popups. Action feedback is
 *    rendered as plain small text. The "clean terminal" look.
 */

let _effects = true;
let _minimal = false;

export function setEffectsEnabled(v: boolean): void { _effects = v; }
export function effectsEnabled(): boolean { return _effects && !_minimal; }

export function setMinimalMode(v: boolean): void { _minimal = v; }
export function minimalMode(): boolean { return _minimal; }

/** Big ASCII action text only when neither effects nor minimal disable it. */
export function bigTextEnabled(): boolean { return !_minimal; }
