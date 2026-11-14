import { useState } from 'react';
import { SPORT_DETAILS, SPORT_ORDER, type Sport } from '../core/sports';
import {
  defaultSportGoals,
  isValidGoalKm,
  type SportGoals,
} from '../core/goals';
import { useLocale } from '../hooks/useLocale';

type Period = 'yearly' | 'monthly';
type Draft = Record<Sport, Record<Period, string>>;

function toDraft(goals: SportGoals): Draft {
  return Object.fromEntries(
    SPORT_ORDER.map(sport => [sport, {
      yearly: String(goals[sport].yearly),
      monthly: String(goals[sport].monthly),
    }])
  ) as Draft;
}

export function GoalSettings({
  goals,
  onSave,
  onReset,
  onClose,
}: {
  goals: SportGoals;
  onSave: (goals: SportGoals) => boolean;
  onReset: () => boolean;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const isJapanese = locale === 'ja';
  const [draft, setDraft] = useState<Draft>(() => toDraft(goals));
  const [message, setMessage] = useState('');

  function update(sport: Sport, period: Period, value: string) {
    setDraft(previous => ({
      ...previous,
      [sport]: { ...previous[sport], [period]: value },
    }));
    setMessage('');
  }

  function save() {
    const next = {} as SportGoals;
    for (const sport of SPORT_ORDER) {
      const yearly = Number(draft[sport].yearly);
      const monthly = Number(draft[sport].monthly);
      if (!draft[sport].yearly.trim() || !draft[sport].monthly.trim() ||
          !isValidGoalKm(yearly) || !isValidGoalKm(monthly)) {
        setMessage(isJapanese
          ? '年間・月間目標には0より大きい数値を入力してください。'
          : 'Enter positive numbers for all annual and monthly goals.');
        return;
      }
      next[sport] = { yearly, monthly };
    }
    setMessage(onSave(next)
      ? (isJapanese ? 'このブラウザに目標を保存しました。' : 'Goals saved in this browser.')
      : (isJapanese ? '保存できませんでした。ブラウザの保存設定を確認してください。'
          : 'Unable to save. Check your browser storage settings.'));
  }

  function reset() {
    if (onReset()) {
      setDraft(toDraft(defaultSportGoals()));
      setMessage(isJapanese ? '初期値に戻しました。' : 'Default goals restored.');
    } else {
      setMessage(isJapanese ? '初期値に戻せませんでした。' : 'Unable to reset goals.');
    }
  }

  return (
    <section
      aria-label={isJapanese ? '種目別の目標設定' : 'Sport goal settings'}
      className="mx-auto mt-3 max-w-[1400px] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {isJapanese ? '種目別の目標設定' : 'Sport goals'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-bg)]"
        >
          {isJapanese ? '閉じる' : 'Close'}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {SPORT_ORDER.map(sport => (
          <div
            key={sport}
            className="rounded-lg border border-[var(--color-border)] p-3"
          >
            <h3 className="mb-2 text-sm font-semibold">
              {SPORT_DETAILS[sport].icon} {SPORT_DETAILS[sport][locale]}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {(['yearly', 'monthly'] as const).map(period => (
                <label key={period} className="block text-xs text-[var(--color-muted)]">
                  <span>
                    {period === 'yearly'
                      ? (isJapanese ? '年間 (km)' : 'Annual (km)')
                      : (isJapanese ? '月間 (km)' : 'Monthly (km)')}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="1000000"
                    step="any"
                    required
                    value={draft[sport][period]}
                    onChange={event => update(sport, period, event.target.value)}
                    aria-label={
                      SPORT_DETAILS[sport][locale] +
                      (period === 'yearly'
                        ? (isJapanese ? ' 年間目標（km）' : ' annual goal (km)')
                        : (isJapanese ? ' 月間目標（km）' : ' monthly goal (km)'))
                    }
                    className="mt-1 w-full min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm text-[var(--color-text)]"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        {isJapanese
          ? '目標は表示中のユーザーごとに、このブラウザだけに保存されます。他の端末・ユーザーには反映されません。週間目標は月間目標から換算します。'
          : 'Goals are saved per selected user in this browser only. Other devices are not synced. Weekly targets are derived from monthly targets.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-on-accent)]"
        >
          {isJapanese ? '保存' : 'Save'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
        >
          {isJapanese ? '初期値に戻す' : 'Reset to defaults'}
        </button>
        {message && <span role="status" className="text-xs text-[var(--color-muted)]">{message}</span>}
      </div>
    </section>
  );
}
