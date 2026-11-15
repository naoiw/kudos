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
import { UserPicker } from '@/components/UserPicker';
import { StatsCards } from '@/components/StatsCards';
import { GoalSettings } from '@/components/GoalSettings';
import { ContributionHeatmap } from '@/components/ContributionHeatmap';
import { ActivityLog } from '@/components/ActivityLog';
import { RouteMap } from '@/components/RouteMap';
import { CalendarWidget } from '@/components/CalendarWidget';
import { ProfileCard } from '@/components/ProfileCard';
import { JapanMap } from '@/components/JapanMap';
import { WorldMap } from '@/components/WorldMap';
import { SPORT_ORDER, SPORT_DETAILS } from '@/core/sports';
import { prefecturesForActivity } from '@/core/prefectureRoutes';
import { countriesForActivity } from '@/core/countryRoutes';
import { activityYear } from '@/core/datePrecision';
import {
  defaultSportGoals,
  loadSportGoals,
  resetSportGoals,
  saveSportGoals,
  type SportGoals,
} from '@/core/goals';

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
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState<SportFilter>('all');
  const [selectedPrefecture, setSelectedPrefecture] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [footprintMode, setFootprintMode] = useState<'japan' | 'world'>('japan');
  const [year, setYear] = useState<number | null>(
    () => getAvailableYears(activities)[0] ?? null
  );
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  const [page, setPage] = useState<Page>(pageFromPath);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalsByUser, setGoalsByUser] = useState<Record<string, SportGoals>>(
    () => Object.fromEntries(
      catalog.users.map(user => [user.user_id, loadSportGoals(user.user_id)])
    )
  );
  const sportGoals = goalsByUser[currentUser.user_id] ?? defaultSportGoals();

  const saveCurrentUserGoals = (goals: SportGoals): boolean => {
    if (!saveSportGoals(currentUser.user_id, goals)) return false;
    setGoalsByUser(previous => ({
      ...previous,
      [currentUser.user_id]: goals,
    }));
    return true;
  };
  const resetCurrentUserGoals = (): boolean => {
    if (!resetSportGoals(currentUser.user_id)) return false;
    setGoalsByUser(previous => ({
      ...previous,
      [currentUser.user_id]: defaultSportGoals(),
    }));
    return true;
  };

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const chooseUser = (userId: string) => {
    const userActivities = catalog.activities.filter((activity) =>
      activity.user_id === userId
    );
    setSelectedUserId(userId);
    setFilter('all');
    setSelectedActivity(null);
    setSelectedPrefecture(null);
    setSelectedCountry(null);
    setYear(getAvailableYears(userActivities)[0] ?? null);
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
  const yearFiltered = useFilteredActivities(activities, 'all', year);
  const baseFiltered = useFilteredActivities(activities, filter, year);
  const filtered = useMemo(() => {
    if (selectedPrefecture) {
      return baseFiltered.filter((activity) =>
        prefecturesForActivity(activity).includes(selectedPrefecture)
      );
    }
    if (selectedCountry) {
      return baseFiltered.filter((activity) =>
        countriesForActivity(activity).includes(selectedCountry)
      );
    }
    return baseFiltered;
  }, [baseFiltered, selectedPrefecture, selectedCountry]);

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
          activityYear(activity.start_date_local) !== year
        ) {
          setYear(activityYear(activity.start_date_local));
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
        <UserPicker
          users={catalog.users}
          selectedUserId={currentUser.user_id}
          locale={locale}
          onChange={chooseUser}
        />
        <span className="text-xs text-[var(--color-muted)]">
          {catalog.mode === 'public-preview'
            ? `公開用の統計データ · ${catalog.datePrecision === 'month' ? '年月のみ公開（日・週単位の統計は非表示）' : '正確な活動日時を公開承認済み'}`
            : '架空のデモデータ'}
        </span>
      </div>
      <div className="mx-auto flex max-w-[1400px] flex-wrap gap-2 px-4 pt-3 sm:px-6" role="group" aria-label="種目で絞り込み">
        {([['all', 'すべて'] as const, ...SPORT_ORDER.map((sport) => [sport, SPORT_DETAILS[sport].ja] as const)]).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setSelectedActivity(null);
              setSelectedPrefecture(null);
              setSelectedCountry(null);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${filter === value ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-card)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={editingGoals}
          onClick={() => setEditingGoals(value => !value)}
          className="ml-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-1.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)]"
        >
          {editingGoals ? '目標設定を閉じる' : '目標設定'}
        </button>
      </div>
      {/* One year selection controls every activity widget and page. */}
      <div
        className="mx-auto max-w-[1400px] overflow-x-auto px-4 pt-3 sm:px-6"
        role="group"
        aria-label={locale === 'ja' ? '表示する年' : 'Activity year'}
      >
        <div className="flex min-w-max items-center gap-2 pb-1">
          <span className="mr-1 text-sm text-[var(--color-muted)]">{locale === 'ja' ? '年' : 'Year'}</span>
          {[null, ...years].map((value) => (
            <button
              key={value ?? 'all'}
              type="button"
              aria-pressed={year === value}
              onClick={() => {
                setYear(value);
                setSelectedActivity(null);
                setSelectedPrefecture(null);
                setSelectedCountry(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${year === value
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'bg-[var(--color-card)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
            >
              {value ?? (locale === 'ja' ? 'すべての年' : 'All years')}
            </button>
          ))}
        </div>
      </div>

      {editingGoals && (
        <div className="px-4 sm:px-6">
          <GoalSettings
            key={currentUser.user_id}
            goals={sportGoals}
            onSave={saveCurrentUserGoals}
            onReset={resetCurrentUserGoals}
            onClose={() => setEditingGoals(false)}
          />
        </div>
      )}

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
            key={`${year ?? 'all'}-${filter}`}
            datePrecision={catalog.datePrecision}
            activities={baseFiltered}
            filter={filter}
            onSelectActivity={(activity) => {
              navigate('home');
              selectActivity(activity);
            }}
          />
        ) : page === 'tracks' ? (
          <TracksPage
            key={`${year ?? 'all'}-${filter}`}
            year={year}
            activities={baseFiltered}
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
                  goals={sportGoals}
                  datePrecision={catalog.datePrecision}
                  activities={filtered}
                  allActivities={activities}
                  year={year}
                  filter={filter}
                  onSelectActivity={selectActivity}
                />
                {catalog.datePrecision !== 'month' && (
                  <ContributionHeatmap
                    key={`${year ?? 'all'}-${filter}`}
                    activities={baseFiltered}
                    year={year}
                    filter={filter}
                    onSelectActivity={selectActivity}
                  />
                )}
                <ActivityLog
                  datePrecision={catalog.datePrecision}
                  activities={filtered}
                  selectedActivity={selectedActivity}
                  onSelectActivity={selectActivity}
                  filter={filter}
                />
              </div>

              {/* Right column */}
              <div className="flex min-w-0 flex-col gap-6 overflow-hidden">
                <ProfileCard activities={yearFiltered} filter={filter} />
                <div>
                  <div className="mb-2 flex flex-wrap gap-2" role="group"
                    aria-label={locale === 'ja' ? '足跡マップの範囲' : 'Footprint map scope'}>
                    {(['japan', 'world'] as const).map((mode) => (
                      <button key={mode} type="button" aria-pressed={footprintMode === mode}
                        onClick={() => {
                          setFootprintMode(mode);
                          setSelectedPrefecture(null);
                          setSelectedCountry(null);
                          setSelectedActivity(null);
                        }}
                        className={footprintMode === mode
                          ? 'rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-on-accent)]'
                          : 'rounded-full bg-[var(--color-card)] px-4 py-1.5 text-sm font-medium text-[var(--color-muted)]'}>
                        {mode === 'japan'
                          ? (locale === 'ja' ? '日本（都道府県）' : 'Japan prefectures')
                          : (locale === 'ja' ? '世界（国・地域）' : 'World countries')}
                      </button>
                    ))}
                  </div>
                  {footprintMode === 'japan' ? (
                    <JapanMap
                      activities={baseFiltered}
                      selectedPrefecture={selectedPrefecture}
                      onSelectPrefecture={(name) => {
                        setSelectedPrefecture(name);
                        setSelectedCountry(null);
                        setSelectedActivity(null);
                      }}
                    />
                  ) : (
                    <WorldMap
                      activities={baseFiltered}
                      selectedCountry={selectedCountry}
                      onSelectCountry={(code) => {
                        setSelectedCountry(code);
                        setSelectedPrefecture(null);
                        setSelectedActivity(null);
                      }}
                    />
                  )}
                </div>
                <div ref={routeSectionRef} className="scroll-mt-28">
                  <RouteMap
                    focusedPrefecture={selectedPrefecture}
                    activities={filtered}
                    allActivities={filtered}
                    selectedActivity={selectedActivity}
                    dark={dark}
                    onClearSelection={() => setSelectedActivity(null)}
                  />
                </div>
                {catalog.datePrecision !== 'month' && (
                  <CalendarWidget
                    key={`${year ?? 'all'}-${filter}-${selectedPrefecture ?? selectedCountry ?? 'all'}`}
                    yearFilter={year}
                    selectedActivity={selectedActivity}
                    activities={filtered}
                    onSelectActivity={selectActivity}
                  />
                )}
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
