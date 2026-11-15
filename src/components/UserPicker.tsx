import type { PublicPreviewUser } from '../core/hooks/useActivities';

interface UserPickerProps {
  users: PublicPreviewUser[];
  selectedUserId: string;
  locale: 'ja' | 'en';
  onChange: (id: string) => void;
}

/** Stateless control: selection and data isolation remain owned by Dashboard. */
export function UserPicker({ users, selectedUserId, locale, onChange }: UserPickerProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
      <span className="text-[var(--color-muted)]">
        {locale === 'ja' ? '表示ユーザー' : 'User'}
      </span>
      <select
        aria-label={locale === 'ja' ? '表示するユーザー' : 'Selected user'}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-[var(--color-text)]"
        value={selectedUserId}
        onChange={event => onChange(event.target.value)}
      >
        {users.map(user => (
          <option key={user.user_id} value={user.user_id}>{user.display_name}</option>
        ))}
      </select>
    </label>
  );
}
