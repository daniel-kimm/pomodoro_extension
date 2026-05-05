import { useEffect, useState } from 'react';
import {
  FULLSCREEN_LOCK_DISABLED_KEY,
  FULLSCREEN_LOCK_ENABLED_LEGACY_KEY,
  FULLSCREEN_LOCK_STORAGE_KEYS,
  readFullscreenLockEnabled,
} from '../../lib/fullscreenLockPref';

export default function SettingsPage() {
  const [fullscreenLock, setFullscreenLock] = useState<boolean | null>(null);

  useEffect(() => {
    const reloadPref = () => {
      chrome.storage.local.get([...FULLSCREEN_LOCK_STORAGE_KEYS], (r) => {
        setFullscreenLock(readFullscreenLockEnabled(r));
      });
    };
    reloadPref();

    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== 'local') return;
      if (
        changes[FULLSCREEN_LOCK_DISABLED_KEY] === undefined &&
        changes[FULLSCREEN_LOCK_ENABLED_LEGACY_KEY] === undefined
      ) {
        return;
      }
      reloadPref();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const setLock = (enabled: boolean) => {
    setFullscreenLock(enabled);
    const syncTabs = () => {
      chrome.runtime.sendMessage({ type: 'FULLSCREEN_PREF_UPDATED' }).catch(() => {});
    };
    if (enabled) {
      chrome.storage.local.remove(
        [FULLSCREEN_LOCK_DISABLED_KEY, FULLSCREEN_LOCK_ENABLED_LEGACY_KEY],
        syncTabs
      );
    } else {
      chrome.storage.local.set({ [FULLSCREEN_LOCK_DISABLED_KEY]: true }, syncTabs);
    }
  };

  if (fullscreenLock === null) {
    return (
      <div className="settings-page">
        <p className="settings-row__desc">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-row">
        <div className="settings-row__text">
          <div className="settings-row__title">Fullscreen lock</div>
          <p className="settings-row__desc">
            When on, blocked tabs stay focused with fullscreen while your timer is running.
            Turn off for normal browsing during sessions.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={fullscreenLock}
          className={
            'settings-switch' + (fullscreenLock ? ' settings-switch--on' : '')
          }
          onClick={() => setLock(!fullscreenLock)}
        >
          <span className="settings-switch__thumb" aria-hidden />
        </button>
      </div>
    </div>
  );
}
