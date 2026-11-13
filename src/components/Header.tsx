import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';

type Page = 'home' | 'tracks' | 'summary';

interface HeaderProps {
  dark: boolean;
  toggleTheme: () => void;
  activities: Activity[];
  page: Page;
  onNavigate: (p: Page) => void;
}

export function Header({ dark, toggleTheme, page, onNavigate }: HeaderProps) {
  const { t } = useLocale();
  const navItems: { label: string; page: Page }[] = [
    { label: t('home'), page: 'home' },
    { label: t('tracks'), page: 'tracks' },
    { label: t('summary'), page: 'summary' },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <button type="button" onClick={() => onNavigate('home')}
          aria-label="ホームに戻る"
          className="border-0 bg-transparent p-0 text-xl font-bold tracking-wider text-[var(--color-text)]">
          KUDOS<span className="text-[var(--color-run)]">.</span>
        </button>
        <nav aria-label="メインナビゲーション" className="flex flex-wrap items-center gap-4 sm:gap-6">
          {navItems.map(item => (
            <button type="button" key={item.page} onClick={() => onNavigate(item.page)}
              aria-current={item.page === page ? 'page' : undefined}
              className={`border-0 bg-transparent p-0 text-sm transition-colors ${item.page === page ? 'font-medium text-[var(--color-accent)]' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
              {item.label}
            </button>
          ))}
          <button type="button" onClick={toggleTheme}
            aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            title={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
            className="rounded-lg px-2 py-1 text-sm text-[var(--color-muted)] hover:bg-[var(--color-card)]">
            {dark ? '☀' : '☾'}
          </button>
          <a href="https://github.com/naoiw/kudos" target="_blank" rel="noopener noreferrer"
            className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]" title="GitHub">GitHub</a>
        </nav>
      </div>
    </header>
  );
}
