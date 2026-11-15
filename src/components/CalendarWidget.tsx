import { useEffect, useMemo, useState } from 'react';
import type { Activity } from '../types';
import { formatDistance } from '../hooks/useActivities';
import { useLocale } from '../hooks/useLocale';
import {
  activityMonth,
  calendarMonthBounds,
  clampCalendarMonth,
  isMonthWithinBounds,
} from '../core/calendarMonthBounds';

interface CalendarWidgetProps {
  activities: Activity[];
  allActivities: Activity[];
  yearFilter: number | null;
  navigationMonth?: Date | null;
  onNavigateMonth: (month: Date) => void;
  selectedActivity?: Activity | null;
  onSelectActivity: (activity: Activity | null) => void;
}

export function CalendarWidget({
  activities,
  allActivities,
  yearFilter,
  navigationMonth,
  onNavigateMonth,
  selectedActivity,
  onSelectActivity,
}: CalendarWidgetProps) {
  const { locale } = useLocale();
  const isJapanese = locale === 'ja';
  const [today] = useState(() => new Date());
  const bounds = useMemo(
    () => calendarMonthBounds(allActivities, today),
    [allActivities, today]
  );
  const latest = useMemo(
    () =>
      activities.reduce(
        (last, a) => (a.start_date_local > last ? a.start_date_local : last),
        ''
      ),
    [activities]
  );
  const initial = selectedActivity?.start_date_local || latest;
  const [month, setMonth] = useState(() => {
    const date = activityMonth(selectedActivity?.start_date_local ?? '') ??
      navigationMonth ??
      activityMonth(latest) ??
      (yearFilter === null
        ? today
        : new Date(yearFilter, today.getMonth(), 1));
    return clampCalendarMonth(date, bounds);
  });
  const [day, setDay] = useState<number | null>(() =>
    selectedActivity
      ? Number(selectedActivity.start_date_local.slice(8, 10))
      : null
  );
  const [previousSelection, setPreviousSelection] = useState(
    selectedActivity?.run_id
  );
  if (previousSelection !== selectedActivity?.run_id) {
    setPreviousSelection(selectedActivity?.run_id);
    if (selectedActivity) {
      const date = activityMonth(selectedActivity.start_date_local);
      if (date) {
        setMonth(clampCalendarMonth(date, bounds));
        setDay(isMonthWithinBounds(date, bounds)
          ? Number(selectedActivity.start_date_local.slice(8, 10))
          : null);
      }
    }
  }
  // Update an already mounted calendar when its user's history boundaries change.
  useEffect(() => {
    if (!isMonthWithinBounds(month, bounds)) {
      setMonth(clampCalendarMonth(month, bounds));
      setDay(null);
    }
  }, [month, bounds]);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const byDay = useMemo(() => {
    const result = new Map<number, Activity[]>();
    for (const activity of activities) {
      const date = new Date(activity.start_date_local);
      if (date.getFullYear() === year && date.getMonth() === monthIndex) {
        const list = result.get(date.getDate()) ?? [];
        list.push(activity);
        result.set(date.getDate(), list);
      }
    }
    for (const list of result.values())
      list.sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
    return result;
  }, [activities, year, monthIndex]);
  const monthActivities = [...byDay.values()].flat();
  const distance = monthActivities.reduce((sum, a) => sum + a.distance, 0);
  const offset = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const dayActivities = day === null ? [] : (byDay.get(day) ?? []);
  const moveMonth = (delta: number) => {
    const next = new Date(year, monthIndex + delta, 1);
    if (!isMonthWithinBounds(next, bounds)) return;
    setMonth(next);
    setDay(null);
    onNavigateMonth(next);
  };
  const goToDate = (date: Date) => {
    const targetYear = yearFilter ?? date.getFullYear();
    const next = clampCalendarMonth(new Date(targetYear, date.getMonth(), 1), bounds);
    setMonth(next);
    setDay(null);
    onNavigateMonth(next);
  };
  const monthLabel = month.toLocaleDateString(isJapanese ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'long',
  });
  return (
    <section
      aria-label={isJapanese ? 'アクティビティカレンダー' : 'Activity calendar'}
      className="w-full min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            className="rounded px-2 text-sm"
            onClick={() => moveMonth(-1)}
            disabled={!isMonthWithinBounds(new Date(year, monthIndex - 1, 1), bounds)}
            aria-label={isJapanese ? '前月' : 'Previous month'}
          >
            ←
          </button>
          <button
            className="rounded px-2 text-sm"
            onClick={() => moveMonth(1)}
            disabled={!isMonthWithinBounds(new Date(year, monthIndex + 1, 1), bounds)}
            aria-label={isJapanese ? '翌月' : 'Next month'}
          >
            →
          </button>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--color-muted)]">
        <span className="mr-auto">
          {monthActivities.length} {isJapanese ? '件' : 'activities'} ·{' '}
          {formatDistance(distance)} km
        </span>
        {(yearFilter === null || yearFilter === today.getFullYear()) && (
          <button
            className="rounded px-2 hover:bg-[var(--color-bg)]"
            onClick={() => goToDate(today)}
          >
            {isJapanese ? '今月' : 'This month'}
          </button>
        )}
        {latest && (
          <button
            className="rounded px-2 hover:bg-[var(--color-bg)]"
            onClick={() => goToDate(new Date(latest))}
          >
            {isJapanese ? '最近のアクティビティ' : 'Latest'}
          </button>
        )}
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-[var(--color-muted)]">
        {(isJapanese
          ? ['月', '火', '水', '木', '金', '土', '日']
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        ).map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }, (_, i) => {
          const number = i - offset + 1;
          if (number < 1 || number > daysInMonth)
            return <span key={i} className="h-9" />;
          const list = byDay.get(number) ?? [];
          const km = list.reduce((sum, a) => sum + a.distance, 0) / 1000;
          return (
            <button
              key={i}
              type="button"
              disabled={!list.length}
              aria-pressed={day === number}
              aria-label={`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(number).padStart(2, '0')} · ${list.length} ${isJapanese ? '件' : 'activities'} · ${km.toFixed(1)} km`}
              className={`calendar-day relative flex h-9 flex-col items-center justify-center rounded-md text-xs ${list.length ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30' : 'text-[var(--color-muted)]'} ${day === number ? 'ring-2 ring-[var(--color-accent)]' : ''}`}
              onClick={() => {
                setDay(number);
                // The date opens its earliest activity; other activities stay selectable below.
                if (list.length > 0) onSelectActivity(list[0]);
              }}
            >
              <span>{number}</span>
              {list.length > 0 && (
                <span className="text-[9px] leading-tight">
                  {km.toFixed(1)}k
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* Keep this panel the same height when navigating months or selecting days. */}
      <div className="mt-3 h-12 overflow-y-auto" aria-live="polite">
        {day !== null && dayActivities.length > 0 ? (
          <div className="space-y-1 border-t border-[var(--color-border)] pt-1">
            <p className="mb-1 text-xs text-[var(--color-muted)]">
              {monthIndex + 1}/{day} ·{' '}
              {isJapanese ? 'アクティビティを選んで経路を見る' : 'Select an activity to view its route'}
            </p>
            {dayActivities.map((activity) => (
              <button
                key={activity.run_id}
                aria-pressed={selectedActivity?.run_id === activity.run_id}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-[var(--color-bg)] aria-pressed:bg-[var(--color-accent)]/10"
                onClick={() => onSelectActivity(activity)}
              >
                <span className="min-w-0 truncate">
                  {activity.start_date_local.slice(11, 16)} · {activity.name}
                </span>
                <span className="shrink-0 font-mono">
                  {(activity.distance / 1000).toFixed(1)} km
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="flex h-full items-center justify-center text-center text-xs text-[var(--color-muted)]">
            {!monthActivities.length
              ? (isJapanese ? 'この月のアクティビティはありません' : 'No activities this month')
              : (isJapanese ? '活動日を選択すると詳細を表示します' : 'Select an active day to view details')}
          </p>
        )}
      </div>
    </section>
  );
}
