export type Locale = 'ja' | 'en';

// Japanese is the default UI language. English strings remain for future use.
export const messages: Record<Locale, Record<string, string>> = {
  ja: {
    totalDistance: '総距離', yearlyGoal: '年間目標', monthlyGoal: '月間目標',
    streak: '連続記録', activities: '回のアクティビティ', runs: '回のウォーキング',
    years: '年', countries: 'か国', provinces: '都道府県', longest: '最長',
    days: '日', weeks: '週', vsLastYear: '前年同期比', vsLastMonth: '前月同期比',
    all: 'すべて', run: 'ウォーキング', heatmapTitle: 'アクティビティ・ヒートマップ',
    less: '少ない', more: '多い', activityLog: 'アクティビティ履歴',
    showing: '表示', of: '/', home: 'ホーム', tracks: 'ルート一覧',
    summary: '集計', loading: '読み込み中…', calendarActivities: '件',
    date: '日付', type: '種目', name: '名前', distance: '距離',
    duration: '運動時間', pace: 'ペース', hr: '心拍数', page: 'ページ',
    pageOf: '/', pages: 'ページ',
  },
  en: {
    totalDistance: 'Total Distance', yearlyGoal: 'Yearly Goal',
    monthlyGoal: 'Monthly Goal', streak: 'Streak', activities: 'activities',
    runs: 'walks', years: 'years', countries: 'countries', provinces: 'regions',
    longest: 'Longest', days: 'days', weeks: 'weeks',
    vsLastYear: 'vs last year', vsLastMonth: 'vs last month', all: 'All',
    run: 'Walking', heatmapTitle: 'Activity Heatmap', less: 'Less', more: 'More',
    activityLog: 'Activity Log', showing: 'Showing', of: 'of',
    home: 'Home', tracks: 'Tracks', summary: 'Summary',
    loading: 'Loading...', calendarActivities: 'activities',
    date: 'DATE', type: 'TYPE', name: 'NAME', distance: 'DISTANCE',
    duration: 'DURATION', pace: 'PACE', hr: 'HR', page: 'Page',
    pageOf: 'of', pages: '',
  },
};
