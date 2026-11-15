import type { Activity } from './types';
import { mondayFirstWeekdayIndex } from './heatmapWeek';
import { parseMovingTime } from './hooks/useActivities';

// Pure date/metric transformations are separate from the large heatmap UI.
// Map any activity type to the 4 display categories
export function toDisplayType(type: string): 'Walk' | 'Ride' | 'Golf' | 'Training' {
  if (type === 'Walk') return 'Walk';
  if (type === 'Ride') return 'Ride';
  if (type === 'Golf') return 'Golf';
  return 'Training';
}

// Dominant display type for a day (by distance; Training is fallback)
function dominantDisplayType(
  acts: Activity[]
): 'Walk' | 'Ride' | 'Golf' | 'Training' {
  if (acts.length === 0) return 'Training';
  const sorted = [...acts].sort((a, b) => b.distance - a.distance);
  return toDisplayType(sorted[0].type);
}

export function buildYearGrid(
  yr: number,
  acts: Activity[],
  isGym: boolean,
  isAll: boolean
) {
  const yearActivities = acts.filter(
    (a) => new Date(a.start_date_local).getFullYear() === yr
  );

  const totalDist = yearActivities.reduce((s, a) => s + a.distance, 0);
  const totalTime = yearActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );
  const runs = yearActivities.filter((a) => a.type === 'Walk');
  // Average pace as distance-weighted mean speed (totalDistance / totalTime),
  // not an arithmetic mean of per-run speeds. M5 fix.
  const runDistance = runs.reduce((s, a) => s + a.distance, 0);
  const runTime = runs.reduce((s, a) => s + parseMovingTime(a.moving_time), 0);
  const avgPace = runTime > 0 && runDistance > 0 ? runDistance / runTime : 0;

  // Per-day totals
  const dayMap = new Map<string, number>();
  const dayTimeMap = new Map<string, number>(); // date → total seconds (for Training)
  const dayActivitiesMap = new Map<string, Activity[]>();
  for (const a of yearActivities) {
    const day = a.start_date_local.slice(0, 10);
    dayMap.set(
      day,
      (dayMap.get(day) || 0) + (isGym ? 1 : a.distance > 0 ? a.distance : 1)
    );
    dayTimeMap.set(
      day,
      (dayTimeMap.get(day) || 0) + parseMovingTime(a.moving_time)
    );
    const arr = dayActivitiesMap.get(day) || [];
    arr.push(a);
    dayActivitiesMap.set(day, arr);
  }

  // Per-type max (for "all" mode per-type intensity)
  // Training uses time (seconds), others use distance
  const typeMaxMap: Record<string, number> = {
    Walk: 1,
    Ride: 1,
    Golf: 1,
    Training: 1,
  };
  if (isAll) {
    dayActivitiesMap.forEach((dayActs, day) => {
      const domType = dominantDisplayType(dayActs);
      const value =
        domType === 'Training'
          ? dayTimeMap.get(day) || 0
          : dayActs.reduce((s, a) => s + (a.distance > 0 ? a.distance : 0), 0);
      if (value > typeMaxMap[domType]) typeMaxMap[domType] = value;
    });
  }

  const maxVal = Math.max(...dayMap.values(), 1);

  const startDate = new Date(yr, 0, 1);
  const startDay = mondayFirstWeekdayIndex(startDate.getDay());
  const grid: {
    date: string;
    distance: number;
    timeSecs: number;
    activities: Activity[];
    domType: string;
    typeRatio: number;
  }[][] = [];
  const monthPositions: { label: string; weekIdx: number }[] = [];
  let currentMonth = -1;
  const totalDays =
    Math.round(
      (new Date(yr, 11, 31).getTime() - startDate.getTime()) / 86400000
    ) + 1;

  for (let d = 0; d < totalDays; d++) {
    const date = new Date(yr, 0, 1 + d);
    const weekIdx = Math.floor((d + startDay) / 7);
    while (grid.length <= weekIdx) grid.push([]);
    const key = `${yr}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dayActs = dayActivitiesMap.get(key) || [];
    const dist = dayMap.get(key) || 0;
    const domType = dominantDisplayType(dayActs);
    const typeValue =
      domType === 'Training'
        ? dayTimeMap.get(key) || 0
        : dayActs.reduce((s, a) => s + (a.distance > 0 ? a.distance : 0), 0);
    const typeRatio = typeValue / (typeMaxMap[domType] ?? 1);
    grid[weekIdx].push({
      date: key,
      distance: dist,
      timeSecs: dayTimeMap.get(key) || 0,
      activities: dayActs,
      domType,
      typeRatio,
    });
    if (date.getMonth() !== currentMonth) {
      currentMonth = date.getMonth();
      monthPositions.push({ label: `${currentMonth + 1}`, weekIdx });
    }
  }

  return {
    grid,
    max: maxVal,
    monthPositions,
    stats: {
      count: yearActivities.length,
      distance: totalDist,
      time: totalTime,
      pace: avgPace,
    },
  };
}

