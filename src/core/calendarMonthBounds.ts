import type { Activity } from './types';

export interface CalendarMonthBounds {
  first: Date;
  last: Date;
}

export function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Read a local calendar month without converting timestamps between timezones. */
export function activityMonth(date: string): Date | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:-|$)/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 100 || year > 9999) return null;
  return new Date(year, month - 1, 1);
}

/**
 * The user's complete history sets the earliest month, irrespective of
 * sport, region and year selections. Never navigate beyond the current month.
 */
export function calendarMonthBounds(
  allUserActivities: readonly Pick<Activity, 'start_date_local'>[],
  now: Date
): CalendarMonthBounds {
  const thisMonth = monthStart(now);
  let first = thisMonth;
  for (const activity of allUserActivities) {
    const date = activityMonth(activity.start_date_local);
    if (date && date.getTime() < first.getTime()) first = date;
  }

  // Browsing across years is allowed: the top year filter follows navigation.
  // The oldest activity month and current month remain the only hard bounds.
  return { first, last: thisMonth };
}

export function isMonthWithinBounds(
  date: Date,
  bounds: CalendarMonthBounds
): boolean {
  const time = monthStart(date).getTime();
  return time >= bounds.first.getTime() && time <= bounds.last.getTime();
}

export function clampCalendarMonth(
  date: Date,
  bounds: CalendarMonthBounds
): Date {
  const time = monthStart(date).getTime();
  if (time < bounds.first.getTime()) return bounds.first;
  if (time > bounds.last.getTime()) return bounds.last;
  return monthStart(date);
}
