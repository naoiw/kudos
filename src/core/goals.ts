import { GOALS, type GoalConfig } from './config';
import { SPORT_ORDER, type Sport } from './sports';
import type { SportFilter } from './types';

export interface SportGoalTargets {
  yearly: number;
  monthly: number;
}

export type SportGoals = Record<Sport, SportGoalTargets>;

const STORAGE_PREFIX = 'kudos:sport-goals:v1:';
const MAX_GOAL_KM = 1_000_000;

export function isValidGoalKm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    value > 0 && value <= MAX_GOAL_KM;
}

export function defaultSportGoals(): SportGoals {
  return {
    Ride: {
      yearly: GOALS.Ride?.yearly ?? 2000,
      monthly: GOALS.Ride?.monthly ?? 150,
    },
    Walk: {
      yearly: GOALS.Walk?.yearly ?? 250,
      monthly: GOALS.Walk?.monthly ?? 20,
    },
    Golf: {
      yearly: GOALS.Golf?.yearly ?? 10,
      monthly: GOALS.Golf?.monthly ?? 1,
    },
  };
}

/** Ignore corrupt or unsupported stored entries instead of breaking the dashboard. */
export function mergeStoredSportGoals(
  raw: unknown,
  defaults: SportGoals = defaultSportGoals()
): SportGoals {
  const object = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const result = {} as SportGoals;
  for (const sport of SPORT_ORDER) {
    const candidate = object[sport];
    const entry = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? candidate as Record<string, unknown>
      : {};
    result[sport] = {
      yearly: isValidGoalKm(entry.yearly) ? entry.yearly : defaults[sport].yearly,
      monthly: isValidGoalKm(entry.monthly) ? entry.monthly : defaults[sport].monthly,
    };
  }
  return result;
}

export function loadSportGoals(userId: string): SportGoals {
  const defaults = defaultSportGoals();
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + userId);
    return stored === null ? defaults : mergeStoredSportGoals(JSON.parse(stored), defaults);
  } catch {
    // Storage may be disabled or corrupted; fall back to bundled goals.
    return defaults;
  }
}

export function saveSportGoals(userId: string, goals: SportGoals): boolean {
  if (!SPORT_ORDER.every(sport =>
    isValidGoalKm(goals[sport]?.yearly) && isValidGoalKm(goals[sport]?.monthly)
  )) return false;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(goals));
    return true;
  } catch {
    return false;
  }
}

export function resetSportGoals(userId: string): boolean {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + userId);
    return true;
  } catch {
    return false;
  }
}

/**
 * The "all" filter adds the targets for all three sports.
 * Weekly goals are estimates derived from monthly goals (12 months / 52 weeks).
 */
export function getGoalForFilter(
  filter: SportFilter,
  targets: SportGoals
): GoalConfig {
  const sports: readonly Sport[] = filter === 'all' ? SPORT_ORDER : [filter];
  const yearly = sports.reduce((sum, sport) => sum + targets[sport].yearly, 0);
  const monthly = sports.reduce((sum, sport) => sum + targets[sport].monthly, 0);
  return {
    yearly,
    monthly,
    weekly: Number((monthly * 12 / 52).toFixed(2)),
    unit: 'distance',
  };
}
