/**
 * Shared configuration for the standalone Kudos import project.
 * No credentials, folder IDs, or personal records belong in this repository.
 */
const KUDOS_SHEETS = Object.freeze({
  Users: [
    'user_id', 'display_name', 'email', 'drive_folder_id', 'timezone', 'enabled',
  ],
  Activities: [
    'activity_id', 'run_id', 'user_id', 'drive_file_id', 'filename',
    'source_format', 'source_hash', 'start_at_utc', 'start_date_local',
    'name', 'name_override', 'sport_detected', 'sport_override', 'sport_final',
    'sport_confidence', 'distance_m', 'moving_time_s', 'elapsed_time_s',
    'elevation_gain_m', 'average_speed_mps', 'average_hr_bpm',
    'prefecture_override', 'route_visibility',
    'imported_at', 'updated_at', 'review_status',
  ],
  ImportLog: [
    'user_id', 'drive_file_id', 'filename', 'modified_at', 'size_bytes',
    'source_hash', 'activity_id', 'status', 'attempts', 'error', 'processed_at',
  ],
  Settings: ['key', 'value', 'description'],
  SyncLog: [
    'sync_id', 'started_at', 'finished_at', 'users_scanned',
    'files_imported', 'files_duplicate', 'files_skipped', 'files_error', 'notes',
  ],
});

const KUDOS_DEFAULT_SETTINGS = Object.freeze([
  ['max_files_per_run', '30', 'Maximum new or changed files processed per execution'],
  ['max_file_mb', '12', 'Reject unexpectedly large input files'],
  ['runtime_budget_ms', '240000', 'Stop before the Apps Script six-minute limit'],
  ['min_moving_speed_mps', '0.5', 'Minimum segment speed counted as moving'],
  ['max_plausible_speed_mps', '45', 'Reject implausible GPS segment jumps'],
  ['max_moving_gap_s', '180', 'Do not count gaps longer than this as moving'],
  ['default_route_visibility', 'stats', 'Private by default: do not publish any route'],
  ['public_preview_export_approval', 'disabled', 'Set I_APPROVE_PUBLIC_STATS only after reviewing public visibility'],
  ['public_preview_user_ids', '', 'Comma-separated private user IDs approved for public statistics'],
  ['public_preview_date_precision', 'month', 'month anonymizes exact activity dates; exact needs additional approval'],
  ['public_preview_exact_dates_approval', 'disabled', 'Set I_APPROVE_EXACT_DATES only for non-sensitive demo activities'],
]);


/**
 * Supported public activity genres. Title and explicit user override take
 * priority over GPX type hints or speed-based inference.
 */
function kudosNormalizeSport_(value) {
  const sport = kudosText_(value).toLowerCase();
  if (sport === 'ride' || sport === 'cycling') return 'Ride';
  if (sport === 'walk' || sport === 'run' || sport === 'walking' ||
      sport === 'hike' || sport === 'running') return 'Walk';
  if (sport === 'golf') return 'Golf';
  return '';
}

function kudosSportFromName_(name) {
  const title = kudosText_(name).toLowerCase();
  if (/ゴルフ|golf/.test(title)) return 'Golf';
  if (/サイクリング|ライド|自転車|ポタリング|cycling|biking|bicycle|bike|ride/.test(title)) {
    return 'Ride';
  }
  if (/ハイキング|ランニング|ジョギング|ウォーキング|ウォーク|散歩|登山|トレッキング|walking|hiking|jogging|running|walk|jog|run|trekking/.test(title)) {
    return 'Walk';
  }
  return '';
}

function kudosResolveSport_(name, detected, override) {
  const explicit = kudosNormalizeSport_(override);
  if (explicit) return { sport: explicit, confidence: 'override' };
  const fromName = kudosSportFromName_(name);
  if (fromName) return { sport: fromName, confidence: 'title' };
  return { sport: kudosNormalizeSport_(detected) || 'Unknown', confidence: 'inferred' };
}

const KUDOS_SPREADSHEET_PROPERTY = 'KUDOS_SPREADSHEET_ID';
const KUDOS_TIMEZONE = 'Asia/Tokyo';

function kudosNowIso_() {
  return new Date().toISOString();
}

function kudosText_(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function kudosAsBoolean_(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function kudosSheetCell_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value;
  const text = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 500);
  // An uploaded filename or GPX title must not become a Sheets formula.
  return /^[=+@\t\r]/.test(text) ? "'" + text : text;
}

function kudosSettings_(ss) {
  const settings = Object.create(null);
  for (const [key, value] of KUDOS_DEFAULT_SETTINGS) {
    settings[key] = value;
  }
  for (const row of kudosReadObjects_(ss.getSheetByName('Settings'), KUDOS_SHEETS.Settings)) {
    const key = kudosText_(row.key);
    if (key) settings[key] = kudosText_(row.value);
  }
  const positiveNumber = (key, min, max) => {
    const value = Number(settings[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error('Invalid Settings value for ' + key);
    }
    return value;
  };
  return {
    maxFiles: Math.floor(positiveNumber('max_files_per_run', 1, 500)),
    maxBytes: positiveNumber('max_file_mb', 0.1, 50) * 1024 * 1024,
    budgetMs: positiveNumber('runtime_budget_ms', 30000, 290000),
    minMovingSpeed: positiveNumber('min_moving_speed_mps', 0, 10),
    maxSpeed: positiveNumber('max_plausible_speed_mps', 5, 100),
    maxMovingGap: positiveNumber('max_moving_gap_s', 10, 3600),
    defaultVisibility: settings.default_route_visibility === 'stats' ?
      'stats' : (() => { throw new Error('default_route_visibility must remain stats until auth is implemented'); })(),
  };
}
