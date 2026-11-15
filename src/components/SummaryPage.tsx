import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity, SportFilter } from '../types';
import type { DatePrecision } from '../core/datePrecision';
import { useLocale } from '../hooks/useLocale';
import { sportMetrics } from '../core/sportMetrics';
import {
  groupSummary,
  summaryChart,
  type SummaryPeriod,
} from '../utils/summary';

const control =
  'rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]';
const panel =
  'rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6';
const number = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function SummaryCard({
  activities,
  period,
  label,
  isJapanese,
  filter,
  onSelectActivity,
  monthOnly,
}: {
  activities: Activity[];
  period: SummaryPeriod;
  monthOnly: boolean;
  label: string;
  isJapanese: boolean;
  filter: SportFilter;
  onSelectActivity: (a: Activity) => void;
}) {
  const chartAvailable = !monthOnly || period !== 'month';
  const chart = chartAvailable ? summaryChart(activities, period, label) : [];
  const metrics = sportMetrics(activities, filter, isJapanese ? 'ja' : 'en',
    monthOnly ? 'month' : null);
  const chartUnit =
    period === 'life'
      ? isJapanese
        ? '年'
        : 'Year'
      : period === 'year'
        ? isJapanese
          ? '月'
          : 'Month'
        : period === 'week'
          ? isJapanese
            ? '月曜〜日曜'
            : 'Mon–Sun'
          : period === 'day'
            ? isJapanese
              ? '開始日時'
              : 'Start time'
            : isJapanese
              ? '日'
              : 'Day';
  return (
    <article className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {label === 'Life'
            ? isJapanese
              ? '全期間の記録'
              : 'All time · Life'
            : label}
        </h2>
        <p className="text-2xl font-semibold text-[var(--color-accent)] tabular-nums">
          {number(activities.reduce((sum, item) => sum + item.distance, 0) / 1000)}{' '}
          <span className="text-sm font-normal text-[var(--color-muted)]">
            {filter === 'Golf' && (isJapanese ? '歩行距離 · ' : 'Walked · ')}km
          </span>
        </p>
      </div>
      <dl className="my-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {metrics.map(({ key, label: name, value }) => (
          <div key={key}>
            <dt className="text-xs text-[var(--color-muted)]">{name}</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {chartAvailable ? <div
        role="img"
        aria-label={`${label}: ${chart.map((d) => `${d.label}: ${d.km} km`).join(', ')}`}
      >
        <div className="h-40 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chart}
              margin={{ top: 8, right: 0, bottom: 0, left: -20 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--color-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={12}
              />
              <YAxis
                tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-border)', opacity: 0.3 }}
                contentStyle={{
                  background: 'var(--color-card)',
                  borderColor: 'var(--color-border)',
                  borderRadius: 8,
                  color: 'var(--color-text)',
                }}
              />
              <Bar
                dataKey="km"
                name="km"
                fill="var(--color-accent)"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-right text-xs text-[var(--color-muted)]">
          {chartUnit} · km
        </p>
      </div> : (
        <p className="text-sm text-[var(--color-muted)]" role="note">
          {isJapanese ? '月単位で公開されているため、日別の内訳は表示しません。'
            : 'Daily breakdown is unavailable for month-only public data.'}
        </p>
      )}
      {period === 'day' && !monthOnly && (
        <div className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-4">
          {activities.map((a) => (
            <button
              key={a.run_id}
              className="flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left text-sm hover:bg-[var(--color-bg)]"
              onClick={() => onSelectActivity(a)}
            >
              <span>
                {a.start_date_local.slice(11, 16)} · {a.name}
              </span>
              <span className="shrink-0 text-[var(--color-accent)]">
                {number(a.distance / 1000)} km ↗
              </span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function SummaryPage({
  activities,
  filter,
  period,
  onPeriodChange,
  onSelectActivity,
  datePrecision,
}: {
  activities: Activity[];
  filter: SportFilter;
  period: SummaryPeriod;
  onPeriodChange: (value: SummaryPeriod) => void;
  onSelectActivity: (a: Activity) => void;
  datePrecision?: DatePrecision | null;
}) {
  const { locale, t } = useLocale();
  const isJapanese = locale === 'ja';
  const monthOnly = datePrecision === 'month';
  const [limit, setLimit] = useState(12);
  const groups = useMemo(
    () => groupSummary(activities, period),
    [activities, period]
  );
  const periods: [SummaryPeriod, string][] = [
    ['life', 'Life'],
    ['year', isJapanese ? '年' : 'Year'],
    ['month', isJapanese ? '月' : 'Month'],
  ];
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('summary')}</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {isJapanese
              ? 'これまでの活動を時系列で振り返ります。'
              : 'Your activity history, one period at a time.'}
          </p>
        </div>

      </div>
      {monthOnly && <p className="mb-4 text-sm text-[var(--color-muted)]" role="note">
        {isJapanese ? '活動日時は年月のみ公開されています。'
          : 'Only year and month are public.'}
      </p>}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label={isJapanese ? '集計単位' : 'Summary period'}
          className="flex gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-1"
        >
          {periods.map(([value, label]) => (
            <button
              key={value}
              aria-pressed={period === value}
              onClick={() => {
                onPeriodChange(value);
                setLimit(12);
              }}
              className={`rounded-lg px-4 py-2 text-sm ${period === value ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-[var(--color-muted)]">
          {groups.length} {isJapanese ? '期間' : 'periods'}
        </span>
      </div>
      {!groups.length ? (
        <p
          role="status"
          className={`${panel} py-16 text-center text-[var(--color-muted)]`}
        >
          {isJapanese
            ? '条件に一致する記録はありません。'
            : 'No activities match these filters.'}
        </p>
      ) : (
        <div
          className={`grid min-w-0 gap-5 ${period === 'life' ? '' : 'xl:grid-cols-2'}`}
        >
          {groups.slice(0, limit).map(([key, items]) => (
            <SummaryCard
              key={key}
              label={key}
              activities={items}
              filter={filter}
              period={period}
              isJapanese={isJapanese}
              monthOnly={monthOnly}
              onSelectActivity={onSelectActivity}
            />
          ))}
        </div>
      )}
      {groups.length > limit && (
        <div className="mt-6 text-center">
          <button className={control} onClick={() => setLimit((n) => n + 12)}>
            {isJapanese ? 'もっと見る' : 'Load more'} ({limit}/{groups.length})
          </button>
        </div>
      )}
    </main>
  );
}

