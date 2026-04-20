import { supabase } from '../lib/supabase';

type StudyTimeTrackerState = {
  pendingSeconds: number;
  lastSyncedAt: string | null;
  runningSegmentStartRemaining: number | null;
};

const STORAGE_KEY = 'studyTimeTracker';
export const STUDY_TIME_SYNC_SIGNAL_KEY = 'studyTimeLastSyncedAt';

const DEFAULT_STATE: StudyTimeTrackerState = {
  pendingSeconds: 0,
  lastSyncedAt: null,
  runningSegmentStartRemaining: null,
};

let trackerLock: Promise<unknown> = Promise.resolve();
let flushInFlight: Promise<number> | null = null;

function withTrackerLock<T>(work: () => Promise<T>): Promise<T> {
  const run = trackerLock.then(work, work);
  trackerLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function loadTrackerState(): Promise<StudyTimeTrackerState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as Partial<StudyTimeTrackerState> | undefined;

  return {
    ...DEFAULT_STATE,
    ...stored,
  };
}

async function saveTrackerState(state: StudyTimeTrackerState): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state,
  });
}

export async function queueTrackedStudySeconds(seconds: number): Promise<number> {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds <= 0) {
    const current = await loadTrackerState();
    return current.pendingSeconds;
  }

  return withTrackerLock(async () => {
    const current = await loadTrackerState();
    const nextPendingSeconds = current.pendingSeconds + safeSeconds;

    await saveTrackerState({
      ...current,
      pendingSeconds: nextPendingSeconds,
    });

    return nextPendingSeconds;
  });
}

export async function startTrackedStudySegment(timeRemaining: number): Promise<void> {
  const safeTimeRemaining = Math.max(0, Math.floor(timeRemaining));

  await withTrackerLock(async () => {
    const current = await loadTrackerState();
    await saveTrackerState({
      ...current,
      runningSegmentStartRemaining: safeTimeRemaining,
    });
  });
}

export async function finalizeTrackedStudySegment(timeRemaining: number): Promise<number> {
  const safeTimeRemaining = Math.max(0, Math.floor(timeRemaining));

  const trackedSeconds = await withTrackerLock(async () => {
    const current = await loadTrackerState();
    const segmentStartRemaining = current.runningSegmentStartRemaining;

    if (segmentStartRemaining == null) {
      return 0;
    }

    const elapsedSeconds = Math.max(0, segmentStartRemaining - safeTimeRemaining);
    await saveTrackerState({
      ...current,
      pendingSeconds: current.pendingSeconds + elapsedSeconds,
      runningSegmentStartRemaining: null,
    });

    return elapsedSeconds;
  });

  if (trackedSeconds > 0) {
    await flushPendingTrackedStudySeconds();
  }

  return trackedSeconds;
}

export async function flushPendingTrackedStudySeconds(): Promise<number> {
  if (flushInFlight) {
    return flushInFlight;
  }

  flushInFlight = withTrackerLock(async () => {
    const current = await loadTrackerState();
    if (current.pendingSeconds <= 0) {
      return 0;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return 0;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('total_study_seconds')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile) {
      return 0;
    }

    const nextTotalStudySeconds =
      ((profile.total_study_seconds as number | null) ?? 0) + current.pendingSeconds;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ total_study_seconds: nextTotalStudySeconds })
      .eq('id', session.user.id);

    if (updateError) {
      return 0;
    }

    const syncedAt = new Date().toISOString();

    await chrome.storage.local.set({
      [STUDY_TIME_SYNC_SIGNAL_KEY]: syncedAt,
    });

    await saveTrackerState({
      pendingSeconds: 0,
      lastSyncedAt: syncedAt,
    });

    return current.pendingSeconds;
  });

  try {
    return await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}
