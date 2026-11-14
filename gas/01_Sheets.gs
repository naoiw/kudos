/**
 * Spreadsheet schema, bootstrap, and safe row-oriented storage.
 * Each activity occupies exactly one row; JSON is not stored in cells.
 */

function kudosOpenSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(KUDOS_SPREADSHEET_PROPERTY);
  if (!id) {
    throw new Error(
      'Set Script Property KUDOS_SPREADSHEET_ID to the private management spreadsheet ID.'
    );
  }
  return SpreadsheetApp.openById(id);
}

function setupSheets() {
  const ss = kudosOpenSpreadsheet_();
  Object.keys(KUDOS_SHEETS).forEach((name) => {
    const headers = KUDOS_SHEETS[name];
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() > 0) {
      const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
      if (headers.some((expected, i) => expected !== actual[i])) {
        throw new Error(
          name + ' already contains incompatible headers; refusing to overwrite data.'
        );
      }
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    const header = sheet.getRange(1, 1, 1, headers.length);
    header.setBackground('#213547').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 160);
    if (name === 'Activities') {
      sheet.setColumnWidth(5, 250);
      sheet.setColumnWidth(10, 260);
    }
  });

  const settingsSheet = ss.getSheetByName('Settings');
  const known = new Set(
    kudosReadObjects_(settingsSheet, KUDOS_SHEETS.Settings).map((row) =>
      kudosText_(row.key)
    )
  );
  const missing = KUDOS_DEFAULT_SETTINGS
    .filter(([key]) => !known.has(key))
    .map((row) => row.map(kudosSheetCell_));
  if (missing.length) {
    const row = settingsSheet.getLastRow() + 1;
    settingsSheet.getRange(row, 1, missing.length, 3).setValues(missing);
  }
  Logger.log('Kudos private sheets initialized. Add users to Users before sync.');
}

function kudosEnsureSheets_(ss) {
  for (const name of Object.keys(KUDOS_SHEETS)) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) throw new Error('Missing ' + name + ' sheet. Run setupSheets().');
    const headers = KUDOS_SHEETS[name];
    const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (headers.some((expected, i) => expected !== actual[i])) {
      throw new Error('Unexpected columns in ' + name + '. Restore the schema.');
    }
  }
}

function kudosReadObjects_(sheet, headers) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, headers.length).getValues().map((values, offset) => {
    const record = { _row: offset + 2 };
    headers.forEach((key, index) => { record[key] = values[index]; });
    return record;
  });
}

function kudosWriteRow_(sheet, headers, values, rowIndex) {
  const row = headers.map((key) => kudosSheetCell_(values[key]));
  const target = rowIndex || sheet.getLastRow() + 1;
  sheet.getRange(target, 1, 1, headers.length).setValues([row]);
  return target;
}

function kudosSaveImportLog_(sheet, current, update) {
  const row = Object.assign({}, current || {}, update);
  kudosWriteRow_(sheet, KUDOS_SHEETS.ImportLog, row, current && current._row);
  return row;
}

function kudosSaveActivity_(sheet, current, parsed, user, file, digest, settings, now) {
  const activityId = current ? current.activity_id :
    'act_' + kudosSha256_(user.user_id + ':' + file.getId()).slice(0, 20);
  const runId = Number.parseInt(kudosSha256_(activityId).slice(0, 12), 16);
  const detected = parsed.sportDetected;
  const override = current ? kudosText_(current.sport_override) : '';
  const nameOverride = current ? kudosText_(current.name_override) : '';
  const sport = override === 'Run' || override === 'Ride' ? override : detected;
  const imported = current && current.imported_at ? current.imported_at : now;
  const state = sport === 'Unknown' ? 'needs_review' : 'ok';
  const updated = {
    activity_id: activityId,
    run_id: runId,
    user_id: user.user_id,
    drive_file_id: file.getId(),
    filename: file.getName(),
    source_format: parsed.format,
    source_hash: digest,
    start_at_utc: parsed.startUtc,
    start_date_local: Utilities.formatDate(
      new Date(parsed.startUtc), user.timezone || KUDOS_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss"
    ),
    name: parsed.name || file.getName(),
    name_override: nameOverride,
    sport_detected: detected,
    sport_override: override,
    sport_final: sport,
    sport_confidence: parsed.sportConfidence,
    distance_m: Math.round(parsed.distanceMeters),
    moving_time_s: Math.round(parsed.movingSeconds),
    elapsed_time_s: Math.round(parsed.elapsedSeconds),
    elevation_gain_m: Math.round(parsed.elevationGainMeters),
    average_speed_mps: parsed.movingSeconds > 0
      ? Math.round(parsed.distanceMeters / parsed.movingSeconds * 1000) / 1000 : 0,
    average_hr_bpm: parsed.averageHeartRate === null
      ? '' : Math.round(parsed.averageHeartRate),
    prefecture_override: current ? kudosText_(current.prefecture_override) : '',
    route_visibility: current && current.route_visibility
      ? kudosText_(current.route_visibility) : settings.defaultVisibility,
    imported_at: imported,
    updated_at: now,
    review_status: state,
  };
  kudosWriteRow_(sheet, KUDOS_SHEETS.Activities, updated, current && current._row);
  return activityId;
}

/**
 * Recompute sport_final after an administrator edits sport_override.
 * Never overwrite the human override when reimporting a GPX.
 */
function applyActivityOverrides() {
  const ss = kudosOpenSpreadsheet_();
  kudosEnsureSheets_(ss);
  return kudosApplyOverrides_(ss.getSheetByName('Activities'));
}

function kudosApplyOverrides_(sheet) {
  const rows = kudosReadObjects_(sheet, KUDOS_SHEETS.Activities);
  const pos = Object.fromEntries(KUDOS_SHEETS.Activities.map((name, i) => [name, i + 1]));
  let changed = 0;
  rows.forEach((row) => {
    const override = kudosText_(row.sport_override);
    const detected = kudosText_(row.sport_detected) || 'Unknown';
    const final = override === 'Run' || override === 'Ride' ? override : detected;
    const state = final === 'Unknown' ? 'needs_review' : 'ok';
    if (kudosText_(row.sport_final) !== final) {
      sheet.getRange(row._row, pos.sport_final).setValue(final);
      changed++;
    }
    if (kudosText_(row.review_status) !== state) {
      sheet.getRange(row._row, pos.review_status).setValue(state);
    }
  });
  return changed;
}
