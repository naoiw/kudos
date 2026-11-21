import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Activity, SportFilter } from '../core/types';
import type { DatePrecision } from '../core/datePrecision';
import type { PublicPreviewUser } from '../core/hooks/useActivities';
import { useLocale } from '../hooks/useLocale';
import {
  compareUsers, comparisonYears, type ComparisonPeriod,
} from '../core/userComparison';

interface ComparePageProps {
  users: PublicPreviewUser[];
  activities: Activity[];
  filter: SportFilter;
  period: ComparisonPeriod;
  year: number | null;
  datePrecision: DatePrecision | null;
  onPeriodChange: (period: ComparisonPeriod) => void;
}

const control = 'rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]';
const panel = 'rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6';
const palette = ['#0284c7', '#e87927', '#a855f7', '#10b981', '#e11d48', '#d4a017'];

export function ComparePage({
  users, activities, filter, period, year, datePrecision, onPeriodChange,
}: ComparePageProps) {
  const { locale } = useLocale();
  const ja = locale === 'ja';
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    users.slice(0, 2).map(user => user.user_id)
  );
  const [month, setMonth] = useState(() => {
    const latest = activities
      .map(activity => activity.start_date_local.slice(0, 7))
      .filter(value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      .sort().at(-1);
    return latest ? Number(latest.slice(5, 7)) : 1;
  });
  const selectedUsers = useMemo(
    () => users.filter(user => selectedIds.includes(user.user_id)),
    [users, selectedIds]
  );
  const years = useMemo(() => comparisonYears(activities), [activities]);
  const activeYear = year ?? years[0] ?? new Date().getFullYear();
  const comparisons = useMemo(
    () => compareUsers(
      activities, selectedUsers.map(user => user.user_id),
      filter, period, activeYear, month, datePrecision
    ),
    [activities, selectedUsers, filter, period, activeYear, month, datePrecision]
  );
  const comparisonById = new Map(comparisons.map(item => [item.userId, item]));
  const trendRows = comparisons[0]?.trend.map((bucket, index) => ({
    label: bucket.label,
    ...Object.fromEntries(comparisons.map(item => [item.userId, item.trend[index]?.km ?? 0])),
  })) ?? [];

  const decimal = (value: number) => value.toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
  const metrics = [
    { id: 'activities', label: ja ? '活動回数' : 'Activities',
      value: (id: string) => String(comparisonById.get(id)?.activityCount ?? 0) },
    { id: 'distance', label: filter === 'Golf'
      ? (ja ? '移動・歩行距離' : 'Distance walked')
      : (ja ? '総距離' : 'Total distance'),
      value: (id: string) => decimal((comparisonById.get(id)?.distanceMeters ?? 0) / 1000) + ' km' },
    { id: 'duration', label: ja ? '活動時間' : 'Moving time',
      value: (id: string) => decimal((comparisonById.get(id)?.movingSeconds ?? 0) / 3600) + ' h' },
    { id: 'prefectures', label: ja ? '訪問都道府県数' : 'Prefectures visited',
      value: (id: string) => String(comparisonById.get(id)?.prefectureCount ?? 0) },
  ];
  const bucketUnit = period === 'life'
    ? (ja ? '年' : 'Year')
    : period === 'year'
      ? (ja ? '月' : 'Month')
      : (ja ? '日' : 'Day');

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{ja ? 'ユーザー比較' : 'Compare users'}</h1>
        <p className="text-sm text-[var(--color-muted)]">
          {ja
            ? '公開済みの活動データから、同じ期間・種目で複数ユーザーを比較します。'
            : 'Compare users within the same period and sport using published activity data.'}
        </p>
      </header>

      <section className={panel} aria-label={ja ? '比較条件' : 'Comparison options'}>
        <h2 className="mb-3 font-semibold">{ja ? '比較対象' : 'Choose users'}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="group"
          aria-label={ja ? '比較するユーザー' : 'Users to compare'}>
          {users.map(user => (
            <label key={user.user_id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--color-border)] p-3 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={selectedIds.includes(user.user_id)}
                onChange={event => {
                  setSelectedIds(previous => event.target.checked
                    ? [...previous, user.user_id]
                    : previous.filter(id => id !== user.user_id));
                }}
              />
              <span>{user.display_name}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div role="group" aria-label={ja ? '比較期間' : 'Comparison period'}>
            <span className="mb-2 block text-xs text-[var(--color-muted)]">
              {ja ? '期間' : 'Period'}
            </span>
            <div className="flex flex-wrap gap-2">
              {([
                ['life', 'Life'],
                ['year', ja ? '年' : 'Year'],
                ['month', ja ? '月' : 'Month'],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={period === value}
                  onClick={() => onPeriodChange(value)}
                  className={period === value
                    ? 'rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-on-accent)]'
                    : control}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {period !== 'life' && (
            <p className="text-sm text-[var(--color-muted)]">
              {ja ? '対象年' : 'Year'}: {activeYear}
              <span className="ml-2 text-xs">
                {ja ? '上部の年フィルターで変更' : 'Change using the year filter above'}
              </span>
            </p>
          )}
          {period === 'month' && (
            <label className="flex flex-col gap-2 text-xs text-[var(--color-muted)]">
              {ja ? '対象月' : 'Month'}
              <select aria-label={ja ? '比較する月' : 'Comparison month'}
                className={control} value={month}
                onChange={event => setMonth(Number(event.target.value))}>
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {ja ? String(index + 1) + '月' : String(index + 1).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {selectedUsers.length < 2 ? (
        <section className={panel} role="status">
          <p className="text-sm text-[var(--color-muted)]">
            {ja
              ? '比較するには公開ユーザーを2人以上選択してください。1人しか登録されていないデモでは比較できません。'
              : 'Select at least two published users to compare. The single-user demo cannot be compared.'}
          </p>
        </section>
      ) : (
        <>
          <section className={panel}>
            <h2 className="mb-4 text-lg font-semibold">
              {ja ? '実績の比較' : 'Activity comparison'}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th scope="col" className="py-3 text-[var(--color-muted)]">
                      {ja ? '指標' : 'Metric'}
                    </th>
                    {selectedUsers.map(user => (
                      <th scope="col" key={user.user_id} className="py-3 font-semibold">
                        {user.display_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(metric => (
                    <tr key={metric.id} className="border-b border-[var(--color-border)] last:border-0">
                      <th scope="row" className="py-3 font-normal text-[var(--color-muted)]">
                        {metric.label}
                      </th>
                      {selectedUsers.map(user => (
                        <td key={user.user_id} className="py-3 font-medium tabular-nums">
                          {metric.value(user.user_id)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {comparisons.some(item => item.activityCount === 0) && (
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                {ja ? '記録のないユーザーは0として表示しています。'
                  : 'Users with no records in this scope are displayed as zero.'}
              </p>
            )}
          </section>
          <section className={panel}>
            <h2 className="mb-3 text-lg font-semibold">
              {ja ? '距離の推移' : 'Distance trend'}
            </h2>
            {trendRows.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]" role="note">
                {datePrecision === 'month' && period === 'month'
                  ? (ja ? '日時は年月のみ公開されているため、日別の推移は表示しません。'
                    : 'Daily trends are unavailable for month-only public data.')
                  : (ja ? '表示できる期間別データがありません。' : 'No trend data is available.')}
              </p>
            ) : (
              <div role="img"
                aria-label={ja ? 'ユーザー別の距離推移（km）' : 'Distance trend by user (km)'}>
                <div className="h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendRows} margin={{ top: 12, right: 8, bottom: 8, left: -15 }}>
                      <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                        axisLine={false} tickLine={false} minTickGap={12} />
                      <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 11 }}
                        axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{
                        background: 'var(--color-card)', borderColor: 'var(--color-border)',
                        borderRadius: 8, color: 'var(--color-text)',
                      }} />
                      <Legend />
                      {selectedUsers.map((user, index) => (
                        <Bar key={user.user_id} dataKey={user.user_id} name={user.display_name}
                          fill={palette[index % palette.length]} maxBarSize={32}
                          isAnimationActive={false} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-right text-xs text-[var(--color-muted)]">
                  {bucketUnit} · km
                </p>
              </div>
            )}
          </section>
        </>
      )}
      <p className="text-xs text-[var(--color-muted)]" role="note">
        {ja
          ? '比較対象は既に公開されたデータのみです。非公開ユーザーの取得・認証機能はありません。訪問都道府県数は公開GPS経路の概略判定で、実際の訪問数と異なる場合があります。'
          : 'Only already-published records are compared; this page does not access private users or provide authentication. Prefecture counts are approximate GPS-based estimates.'}
      </p>
    </main>
  );
}
