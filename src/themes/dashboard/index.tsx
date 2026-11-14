import './index.css';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Activity, SportFilter } from '@/types';
import {
  useFilteredActivities,
  getAvailableYears,
  getActivityCatalog,
} from '@/hooks/useActivities';
import { useTheme } from '@/hooks/useTheme';
import { useLocale } from '@/hooks/useLocale';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ContributionHeatmap } from '@/components/ContributionHeatmap';
import { ActivityLog } from '@/components/ActivityLog';
import { RouteMap } from '@/components/RouteMap';
import { CalendarWidget } from '@/components/CalendarWidget';
import { ProfileCard } from '@/components/ProfileCard';
import { JapanMap } from '@/components/JapanMap';
import { SPORT_ORDER, SPORT_DETAILS } from '@/core/sports';
import { prefecturesForActivity } from '@/core/prefectureRoutes';
import { PersonalBest } from '@/components/PersonalBest';

const TracksPage = lazy(() =>
  import('@/components/TracksPage').then((module) => ({
    default: module.TracksPage,
  }))
);
const SummaryPage = lazy(() =>
  import('@/components/SummaryPage').then((module) => ({
    default: module.SummaryPage,
  }))
);

type Page = 'home' | 'tracks' | 'summary';
const pageFromPath = (): Page =>
  window.location.pathname
    .slice(import.meta.env.BASE_URL.length)
    .replace(/\/$/, '') === 'summary'
    ? 'summary'
    : window.location.pathname
          .slice(import.meta.env.BASE_URL.length)
          .replace(/\/$/, '') === 'tracks'
      ? 'tracks'
      : 'home';

function Dashboard() {
  const routeSectionRef = useRef<HTMLDivElement>(null);
  const catalog = getActivityCatalog();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('u')
  );
  const currentUser =
    catalog.users.find((user) => user.user_id === selectedUserId) ||
    catalog.users.find((user) =>
      catalog.activities.some((activity) => activity.user_id === user.user_id)
    ) ||
    catalog.users[0];
  const activities = useMemo(
    () => catalog.activities.filter((activity) => activity.user_id === currentUser.user_id),
    [catalog, currentUser]
  );
  const { dark, toggle } = useTheme();
  const { t } = useLocale();
  const [filter, setFilter] = useState<SportFilter>('all');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  const [page, setPage] = useState<Page>(pageFromPath);

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const chooseUser = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedActivity(null);
    setSelectedPrefecture(null);
    setYear(null);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('u', userId);
    window.history.replaceState(null, '', nextUrl);
  };

  const navigate = (next: Page) => {
    window.history.pushState(
      null,
      '',
      `${import.meta.env.BASE_URL}${next === 'home' ? '' : next}${window.location.search}`
    );
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const [currentYear] = useState(() => new Date().getFullYear());
  const years = useMemo(() => getAvailableYears(activities), [activities]);
  const baseFiltered = useFilteredActivities(activities, filter, year);
  const filtered = useMemo(
    () => selectedPrefecture
      ? baseFiltered.filter((activity) =>
          prefecturesForActivity(activity).includes(selectedPrefecture)
        )
      : baseFiltered,
    [baseFiltered, selectedPrefecture]
  );
  const heatmapYear = year ?? years[0] ?? currentYear;

  const selectActivity = useCallback(
    (activity: Activity | null) => {
      setSelectedActivity(activity);
      if (activity) {
        if (window.matchMedia('(max-width: 1023px)').matches) {
          requestAnimationFrame(() =>
            routeSectionRef.current?.scrollIntoView({
              block: 'start',
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'instant'
                : 'smooth',
            })
          );
        }
        if (
          year !== null &&
          new Date(activity.start_date_local).getFullYear() !== year
        ) {
          setYear(new Date(activity.start_date_local).getFullYear());
        }
      }
    },
    [year]
  );

  return (
    <div
      className="dashboard min-h-screen bg-[var(--color-bg)]"
      data-filter={filter}
    >
      <Header
        dark={dark}
        toggleTheme={toggle}
        activities={activities}
        page={page}
        onNavigate={navigate}
      />

      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <span className="text-[var(--color-muted)]">表示ユーザー</span>
          <select
            aria-label="表示するユーザー"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[var(--color-text)]"
            value={currentUser.user_id}
            onChange={(event) => chooseUser(event.target.value)}
          >
            {catalog.users.map((user) => (
              <option key={user.user_id} value={user.user_id}>{user.display_name}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-[var(--color-muted)]">
          {catalog.mode === 'public-preview'
            ? `公開用の統計データ · ${catalog.datePrecision === 'month' ? '日付は月単位に匿名化' : '公開承認済み'}`
            : '架空のデモデータ'}
        </span>
      </div>
      <div className="mx-auto flex max-w-[1400px] flex-wrap gap-2 px-4 pt-3 sm:px-6" role="group" aria-label="種目で絞り込み">
        {([['all', 'すべて'] as const, ...SPORT_ORDER.map((sport) => [sport, SPORT_DETAILS[sport].ja] as const)]).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => { setFilter(value); setSelectedActivity(null); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${filter === value ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-card)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-[1400px] px-4 pt-3 text-xs text-[var(--color-muted)] sm:px-6" role="note">
        {catalog.mode === 'public-preview'
          ? 'GPX経路・活動情報は公開サイト上で閲覧可能です。非公開運用には別途アクセス制限が必要です。'
          : 'デモ表示：掲載中のアクティビティとGPS経路は架空のサンプルデータです。'}
      </div>
      <Suspense
        fallback={
          <main
            className="mx-auto flex min-h-[60vh] max-w-[1400px] items-center justify-center p-6 text-sm text-[var(--color-muted)]"
            role="status"
          >
            {t('loading')}
          </main>
        }
      >
        {page === 'summary' ? (
          <SummaryPage
            activities={activities}
            onSelectActivity={(activity) => {
              navigate('home');
              setYear(null);
              selectActivity(activity);
            }}
          />
        ) : page === 'tracks' ? (
          <TracksPage
            activities={activities}
            dark={dark}
            filter={filter}
            onSelectActivity={selectActivity}
            onBack={() => {
              navigate('home');
              window.scrollTo({ top: 0, behavior: 'instant' });
            }}
          />
        ) : (
          <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
              {/* Left column */}
              <div className="min-w-0 space-y-6 overflow-hidden">
                <StatsCards
                  activities={filtered}
                  allActivities={activities}
                  year={year}
                  filter={filter}
                  onSelectActivity={selectActivity}
                />
                <ContributionHeatmap
                  activities={activities}
                  year={heatmapYear}
                  filter={filter}
                  onSelectActivity={selectActivity}
                />
                <ActivityLog
                  activities={filtered}
                  years={years}
                  year={year}
                  setYear={(value) => {
                    setYear(value);
                    setSelectedActivity(null);
                              }}
                  selectedActivity={selectedActivity}
                  onSelectActivity={selectActivity}
                  filter={filter}
                />
              </div>

              {/* Right column */}
              <div className="flex min-w-0 flex-col gap-6 overflow-hidden">
                <ProfileCard activities={activities} filter={filter} />
                <JapanMap
                  activities={baseFiltered}
                  selectedPrefecture={selectedPrefecture}
                  onSelectPrefecture={(name) => {
                    setSelectedPrefecture(name);
                    setSelectedActivity(null);
                  }}
                />
                <div ref={routeSectionRef} className="scroll-mt-28">
                  <RouteMap
                    focusedPrefecture={selectedPrefecture}
                    activities={filtered}
                    allActivities={activities}
                    selectedActivity={selectedActivity}
                    dark={dark}
                    onClearSelection={() => setSelectedActivity(null)}
                  />
                </div>
                <PersonalBest
                  activities={activities}
                  onSelectActivity={selectActivity}
                />
                <CalendarWidget
                  key={year ?? 'all'}
                  selectedActivity={selectedActivity}
                  activities={filtered}
                  onSelectActivity={selectActivity}
                />
              </div>
            </div>
          </main>
        )}
      </Suspense>

      <footer className="border-t border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
        &copy; {currentYear} Kudos
      </footer>
    </div>
  );
}

export default Dashboard;
