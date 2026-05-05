/** User turned fullscreen lock off (sticky until cleared). */
export const FULLSCREEN_LOCK_DISABLED_KEY = 'fullscreenLockDisabled';
/** Legacy toggle key — still honored if false. */
export const FULLSCREEN_LOCK_ENABLED_LEGACY_KEY = 'fullscreenLockEnabled';

/**
 * Whether timer fullscreen enforcement should run.
 * Default ON when unset. OFF only when explicitly opted out (new key) or legacy false.
 */
export function readFullscreenLockEnabled(r: {
  fullscreenLockDisabled?: unknown;
  fullscreenLockEnabled?: unknown;
}): boolean {
  if (coerceTruthy(r.fullscreenLockDisabled)) return false;
  if (
    r.fullscreenLockEnabled === false ||
    r.fullscreenLockEnabled === 'false' ||
    r.fullscreenLockEnabled === 0 ||
    r.fullscreenLockEnabled === '0'
  ) {
    return false;
  }
  return true;
}

function coerceTruthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}

export const FULLSCREEN_LOCK_STORAGE_KEYS = [
  FULLSCREEN_LOCK_DISABLED_KEY,
  FULLSCREEN_LOCK_ENABLED_LEGACY_KEY,
] as const;
