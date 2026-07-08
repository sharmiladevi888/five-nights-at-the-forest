// Single source of truth for scoring. Used server-side to VALIDATE
// client-submitted runs so scores can't be forged.
export const SCORE = {
  NIGHT_BASE: 1000,
  PER_SECOND: 5,
  PER_CREATURE_EVADED: 50,
  PER_ITEM: 25,
};

export interface RunStats {
  nightsCleared: number;
  secondsSurvived: number;
  creaturesEvaded: number;
  itemsCollected: number;
}

export function computeScore(s: RunStats): number {
  return (
    s.nightsCleared * SCORE.NIGHT_BASE +
    s.secondsSurvived * SCORE.PER_SECOND +
    s.creaturesEvaded * SCORE.PER_CREATURE_EVADED +
    s.itemsCollected * SCORE.PER_ITEM
  );
}

// Basic sanity bounds so a client can't submit absurd stats.
export function statsArePlausible(s: RunStats): boolean {
  if (s.nightsCleared < 0 || s.nightsCleared > 5) return false;
  if (s.secondsSurvived < 0 || s.secondsSurvived > 60 * 60) return false;
  if (s.creaturesEvaded < 0 || s.creaturesEvaded > 5000) return false;
  if (s.itemsCollected < 0 || s.itemsCollected > 5000) return false;
  return true;
}
