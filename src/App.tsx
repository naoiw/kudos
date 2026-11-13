import { lazy, Suspense } from 'react';
import { LocaleProvider, useLocale } from './hooks/useLocale';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './core/theme';

// The original project supports more themes; Kudos currently uses Dashboard only.
const Dashboard = lazy(() => import('./themes/dashboard'));

function Loading() {
  const { t } = useLocale();
  return <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">{t('loading')}</div>;
}

export default function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}><Dashboard /></Suspense>
        </ErrorBoundary>
      </LocaleProvider>
    </ThemeProvider>
  );
}
