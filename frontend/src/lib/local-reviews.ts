import { useMemo, useSyncExternalStore } from 'react';
import type { AssessmentScope, EmployeeAssessmentSnapshot } from './assessment-model';

const KEY = 'raise-hse-reviews-v1';
const CHANGED = 'raise:hse-review-changed';
export type LocalReviewDecision = 'needs_evidence' | 'reviewed';

export interface LocalHseReview extends AssessmentScope {
  status: LocalReviewDecision;
  reviewer: string;
  notes: string;
  savedAt: string;
  storage: 'frontend_local';
}

export type LocalReviewStore = Record<string, LocalHseReview>;

function rawReviews(): string {
  try { return window.localStorage.getItem(KEY) || '{}'; } catch { return '{}'; }
}

export function readLocalReviews(): LocalReviewStore {
  try {
    const data: unknown = JSON.parse(rawReviews());
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, entry]) => entry && typeof entry === 'object' && typeof entry.workerId === 'string' && typeof entry.snapshotId === 'string' && typeof entry.revision === 'string' && ['needs_evidence', 'reviewed'].includes(entry.status)));
  } catch { return {}; }
}

export function reviewForSnapshot(store: LocalReviewStore, snapshot: EmployeeAssessmentSnapshot): LocalHseReview | null {
  const review = store[snapshot.scopeKey];
  const scope = snapshot.scope;
  if (!review || review.workerId !== scope.workerId || review.snapshotId !== scope.snapshotId || review.revision !== scope.revision || review.period !== scope.period || review.from !== scope.from || review.to !== scope.to || review.source !== scope.source) return null;
  return review;
}

export function saveLocalReview(snapshot: EmployeeAssessmentSnapshot, current: EmployeeAssessmentSnapshot, input: { status: LocalReviewDecision; reviewer: string; notes: string }): LocalHseReview {
  if (snapshot.scopeKey !== current.scopeKey) throw new Error('The snapshot changed during review. Reopen the review to use the latest data and revision.');
  if (!input.reviewer.trim() || input.notes.trim().length < 5) throw new Error('Enter the HSE reviewer name and a note of at least 5 characters.');
  if (!snapshot.windows.length && !snapshot.noise.readings.length) throw new Error('There are no results to review for this period.');
  const review: LocalHseReview = { ...snapshot.scope, status: input.status, reviewer: input.reviewer.trim(), notes: input.notes.trim(), savedAt: new Date().toISOString(), storage: 'frontend_local' };
  const next = { ...readLocalReviews(), [snapshot.scopeKey]: review };
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); }
  catch { throw new Error('The review could not be saved. Browser storage is full or restricted.'); }
  window.dispatchEvent(new Event(CHANGED));
  return review;
}

export function useLocalReviews(): LocalReviewStore {
  const raw = useSyncExternalStore(subscribe, rawReviews, () => '{}');
  return useMemo(() => readLocalReviews(), [raw]);
}

function subscribe(update: () => void) {
  const storage = (event: StorageEvent) => { if (!event.key || event.key === KEY) update(); };
  window.addEventListener(CHANGED, update);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(CHANGED, update); window.removeEventListener('storage', storage); };
}
