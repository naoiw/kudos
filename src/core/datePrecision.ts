/**
 * Public dates are either real local timestamps or month-only disclosures.
 * Never infer a calendar day from month-only data.
 */
export type DatePrecision = 'month' | 'exact';

export function resolveDatePrecision(value: unknown): DatePrecision {
  // Older manifests without a precision declaration are treated conservatively.
  return value === 'exact' ? 'exact' : 'month';
}

export function normalizePublicDate(value: string, precision: DatePrecision): string {
  if (precision !== 'month') return value;
  const match = /^(\d{4})-(0[1-9]|1[0-2])(?:$|[-T])/.exec(value);
  if (!match) throw new Error('Invalid month-only public activity date');
  return match[1] + '-' + match[2];
}

export function isMonthOnlyDate(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function activityYear(value: string): number {
  return Number(value.slice(0, 4));
}

export function formatActivityDate(
  value: string,
  locale: 'ja' | 'en',
  includeTime = false
): string {
  if (isMonthOnlyDate(value)) {
    const year = value.slice(0, 4);
    const month = Number(value.slice(5, 7));
    return locale === 'ja' ? year + '年' + month + '月' : value;
  }
  const year = value.slice(0, 4);
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = locale === 'ja'
    ? year + '年' + month + '月' + day + '日'
    : value.slice(0, 10);
  return includeTime && value.length >= 16
    ? date + ' ' + value.slice(11, 16)
    : date;
}
