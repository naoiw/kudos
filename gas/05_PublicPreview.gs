/**
 * Explicit export of user display names and GPX/TCX routes.
 *
 * This remains a manual action. The repository is currently public: executing
 * publishApprovedPublicPreview() makes these records publicly accessible.
 * Do not add automatic publication until hosting and access control are ready.
 */
const KUDOS_PUBLIC_PREVIEW_REPO = 'naoiw/kudos';
const KUDOS_PUBLIC_PREVIEW_PATH = 'public/data/preview.json';
const KUDOS_PUBLIC_EXPORT_APPROVAL = 'I_APPROVE_PUBLIC_STATS';

function kudosPreviewSettings_(ss) {
  const values = new Map();
  for (const row of kudosReadObjects_(
    ss.getSheetByName('Settings'), KUDOS_SHEETS.Settings
  )) {
    values.set(kudosText_(row.key), kudosText_(row.value));
  }
  if (values.get('public_preview_export_approval') !== KUDOS_PUBLIC_EXPORT_APPROVAL) {
    throw new Error(
      'Public preview is disabled. Review public disclosure and set ' +
      'Settings.public_preview_export_approval = ' + KUDOS_PUBLIC_EXPORT_APPROVAL
    );
  }
  const userIds = (values.get('public_preview_user_ids') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!userIds.length || new Set(userIds).size !== userIds.length) {
    throw new Error('Set distinct public_preview_user_ids before exporting.');
  }
  const precision = values.get('public_preview_date_precision') || 'month';
  if (precision !== 'month' && precision !== 'exact') {
    throw new Error('public_preview_date_precision must be month or exact.');
  }
  if (precision === 'exact' &&
    values.get('public_preview_exact_dates_approval') !== 'I_APPROVE_EXACT_DATES') {
    throw new Error('Exact dates require a separate I_APPROVE_EXACT_DATES confirmation.');
  }
  return { userIds, precision };
}

function kudosPreviewLocalDate_(row, timezone) {
  const value = row.start_at_utc;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Utilities.formatDate(
    date, timezone || KUDOS_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"
  );
}

function kudosPreviewDuration_(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) / 60) * 60);
  const pad = (n) => String(n).padStart(2, '0');
  return pad(Math.floor(s / 3600)) + ':' +
    pad(Math.floor(s % 3600 / 60)) + ':00';
}

/**
 * Project selected spreadsheet rows into the dashboard activity schema.
 * Public-facing IDs stay stable aliases to avoid exposing Sheets/Drive IDs.
 */
function kudosBuildPublicPreview_(users, activities, allowlist, precision, now, routesByFile) {
  const active = new Map();
  for (const user of users) {
    const key = kudosText_(user.user_id);
    if (kudosAsBoolean_(user.enabled)) active.set(key, user);
  }
  const ids = [...allowlist].sort();
  for (const id of ids) {
    if (!active.has(id)) {
      throw new Error('Requested public preview user is not enabled: ' + id);
    }
  }

  const safeUsers = ids.map((id, i) => ({
    user_id: 'u' + String(i + 1).padStart(2, '0'),
    display_name: kudosText_(active.get(id).display_name) || 'ユーザー ' + (i + 1),
  }));
  const publicActivities = [];

  ids.forEach((id, i) => {
    const user = active.get(id);
    const rows = activities.filter((row) =>
      kudosText_(row.user_id) === id &&
      kudosText_(row.review_status) === 'ok' &&
      (kudosText_(row.sport_final) === 'Run' ||
        kudosText_(row.sport_final) === 'Ride')
    ).sort((a, b) => {
      return String(b.start_at_utc).localeCompare(String(a.start_at_utc));
    });
    rows.forEach((row, index) => {
      const local = kudosPreviewLocalDate_(row, kudosText_(user.timezone));
      if (!local) return;
      const distance = Math.round(Number(row.distance_m) / 100) * 100;
      const rawSeconds = Number(row.moving_time_s);
      if (!Number.isFinite(distance) || distance <= 0 ||
          !Number.isFinite(rawSeconds) || rawSeconds < 0) return;

      const seconds = Math.max(60, Math.round(rawSeconds / 60) * 60);
      const date = precision === 'month'
        ? local.slice(0, 8) +
          String(1 + (index * 7) % 28).padStart(2, '0') + 'T12:00:00'
        : local;
      const sport = kudosText_(row.sport_final);
      const gain = Number(row.elevation_gain_m);
      const route = routesByFile && routesByFile.get(
        kudosLogKey_(id, kudosText_(row.drive_file_id))
      );
      const routeSegments = route || [];
      publicActivities.push({
        run_id: (i + 1) * 1000000 + index + 1,
        user_id: safeUsers[i].user_id,
        name: kudosText_(row.name_override) || kudosText_(row.name) ||
          (sport === 'Run' ? 'ランニング' : 'サイクリング'),
        type: sport,
        distance: distance,
        moving_time: kudosPreviewDuration_(seconds),
        start_date: date,
        start_date_local: date,
        location_country: kudosText_(row.prefecture_override) || null,
        summary_polyline: routeSegments[0] || null,
        route_segments: routeSegments,
        average_heartrate: null,
        average_speed: Number((distance / seconds).toFixed(3)),
        elevation_gain: Number.isFinite(gain)
          ? Math.round(Math.max(0, gain) / 10) * 10 : null,
        source: 'public-preview',
        streak: 0,
      });
    });
  });
  return {
    schema_version: 1,
    mode: 'public-stats-preview',
    generated_at: now,
    date_precision: precision,
    users: safeUsers,
    activities: publicActivities,
  };
}

/**
 * Google encoded polyline: precision 5, compatible with @mapbox/polyline.
 * Only coordinate pairs are exported; timestamps and heart rate remain in GPX.
 */
function kudosEncodePolyline_(points) {
  let previousLat = 0;
  let previousLng = 0;
  let output = '';
  const encodeNumber = (number) => {
    let value = number < 0 ? ~(number << 1) : number << 1;
    let chars = '';
    while (value >= 0x20) {
      chars += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>>= 5;
    }
    return chars + String.fromCharCode(value + 63);
  };
  for (const point of points) {
    const lat = Math.round(point.lat * 100000);
    const lng = Math.round(point.lng * 100000);
    output += encodeNumber(lat - previousLat) + encodeNumber(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return output;
}

/**
 * Preserve each GPX/TCX track segment as a separate polyline so disconnected
 * track recordings do not acquire artificial straight lines across gaps.
 * Keep roughly 10-meter resolution; cap at 4,000 vertices per segment.
 */
function kudosEncodeRouteSegments_(segments) {
  const result = [];
  for (const segment of segments) {
    if (segment.length < 2) continue;
    const points = [segment[0]];
    for (let i = 1; i < segment.length - 1; i++) {
      if (kudosHaversine_(points[points.length - 1], segment[i]) >= 10) {
        points.push(segment[i]);
      }
    }
    const end = segment[segment.length - 1];
    if (points[points.length - 1] !== end) points.push(end);
    if (points.length < 2) continue;

    let selected = points;
    if (points.length > 4000) {
      selected = Array.from({ length: 4000 }, (_, i) =>
        points[Math.round(i * (points.length - 1) / 3999)]
      );
    }
    result.push(kudosEncodePolyline_(selected));
  }
  return result;
}

/**
 * GPX/TCX source files are kept in Drive; only the generated polylines are
 * written to the JSON data file. No need to reimport activities into Sheets.
 */
function kudosReadPreviewRoutes_(activities, userIds) {
  const selectedUsers = new Set(userIds);
  const routes = new Map();
  for (const row of activities) {
    const userId = kudosText_(row.user_id);
    if (!selectedUsers.has(userId) ||
        kudosText_(row.review_status) !== 'ok' ||
        !['Run', 'Ride'].includes(kudosText_(row.sport_final))) {
      continue;
    }
    const fileId = kudosText_(row.drive_file_id);
    if (!fileId) throw new Error('Missing Drive file ID for ' + row.activity_id);
    const key = kudosLogKey_(userId, fileId);
    if (routes.has(key)) continue;

    try {
      const file = DriveApp.getFileById(fileId);
      const xml = file.getBlob().getDataAsString('UTF-8').replace(/^\\uFEFF/, '');
      const root = XmlService.parse(xml).getRootElement();
      const name = root.getName().toLowerCase();
      const input = name === 'gpx' ? kudosParseGpx_(root)
        : name === 'trainingcenterdatabase' ? kudosParseTcx_(root) : null;
      if (!input) throw new Error('Unsupported GPX/TCX format');
      const encoded = kudosEncodeRouteSegments_(input.segments);
      if (!encoded.length) throw new Error('File has no drawable GPS track');
      routes.set(key, encoded);
    } catch (error) {
      throw new Error('Failed to read GPS route for activity ' +
        row.activity_id + ': ' + String(error));
    }
  }
  return routes;
}

function kudosPreparePublicPreview_() {
  const ss = kudosOpenSpreadsheet_();
  kudosEnsureSheets_(ss);
  const selection = kudosPreviewSettings_(ss);
  const users = kudosReadObjects_(ss.getSheetByName('Users'), KUDOS_SHEETS.Users);
  const activities = kudosReadObjects_(
    ss.getSheetByName('Activities'), KUDOS_SHEETS.Activities
  );
  const routeData = kudosReadPreviewRoutes_(activities, selection.userIds);
  return kudosBuildPublicPreview_(
    users, activities, selection.userIds, selection.precision, kudosNowIso_(),
    routeData
  );
}

/** Review the preview counts locally before pressing publish. */
function inspectApprovedPublicPreview() {
  const preview = kudosPreparePublicPreview_();
  const report = {
    users: preview.users.length,
    activities: preview.activities.length,
    date_precision: preview.date_precision,
    gps_routes_included: preview.activities.filter((a) => a.route_segments.length > 0).length,
    display_names_included: true,
    user_email_included: false,
    repository_public: true,
  };
  Logger.log(JSON.stringify(report));
  return report;
}

/**
 * Manually publish the selected activities and routes to GitHub Pages.
 *
 * Requires a fine-grained GitHub token in Script Properties:
 * KUDOS_GITHUB_TOKEN, repository access only to naoiw/kudos, with
 * Contents read/write permissions. Do not paste the token in any sheet.
 */
function publishApprovedPublicPreview() {
  const preview = kudosPreparePublicPreview_();
  const token = PropertiesService.getScriptProperties()
    .getProperty('KUDOS_GITHUB_TOKEN');
  if (!token) throw new Error('Missing Script Property KUDOS_GITHUB_TOKEN.');

  const url = 'https://api.github.com/repos/' +
    KUDOS_PUBLIC_PREVIEW_REPO + '/contents/' + KUDOS_PUBLIC_PREVIEW_PATH;
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Kudos-GAS-Preview',
  };
  const readResponse = UrlFetchApp.fetch(url + '?ref=main', {
    method: 'get',
    headers,
    muteHttpExceptions: true,
  });
  const readCode = readResponse.getResponseCode();
  if (readCode !== 200 && readCode !== 404) {
    throw new Error('GitHub preview read failed with status ' + readCode);
  }

  const body = {
    message: 'data: update explicitly approved public statistics preview',
    branch: 'main',
    content: Utilities.base64Encode(
      JSON.stringify(preview, null, 2) + '\n',
      Utilities.Charset.UTF_8
    ),
  };
  if (readCode === 200) {
    const metadata = JSON.parse(readResponse.getContentText());
    if (!metadata.sha) throw new Error('GitHub response is missing the file SHA.');
    body.sha = metadata.sha;
  }

  const response = UrlFetchApp.fetch(url, {
    method: 'put',
    headers,
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const status = response.getResponseCode();
  if (status !== 200 && status !== 201) {
    throw new Error('GitHub preview write failed with status ' + status);
  }
  Logger.log(
    'Public preview updated: ' + preview.users.length + ' users, ' +
    preview.activities.length + ' activities. GitHub Pages will redeploy.'
  );
  return { users: preview.users.length, activities: preview.activities.length };
}
