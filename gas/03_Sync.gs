/**
 * Private Google Drive -> Sheets ingestion.
 *
 * Owner-only time triggers execute this file. Never commit GPX contents,
 * raw coordinates, spreadsheet identifiers, or secrets to the public repo.
 */

function kudosValidateUsers_(rows) {
  const enabled = rows.filter((row) => kudosAsBoolean_(row.enabled));
  const ids = new Set();
  const folders = new Set();

  return enabled.map((row) => {
    const id = kudosText_(row.user_id);
    const folder = kudosText_(row.drive_folder_id);
    if (!/^[a-z0-9][a-z0-9_-]{0,30}$/.test(id)) {
      throw new Error('Invalid user_id: ' + id);
    }
    if (!folder || folders.has(folder)) {
      throw new Error('Each active user needs a unique Drive folder: ' + id);
    }
    if (ids.has(id)) {
      throw new Error('Duplicate user_id: ' + id);
    }
    ids.add(id);
    folders.add(folder);

    const timezone = kudosText_(row.timezone) || KUDOS_TIMEZONE;
    try {
      Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
    } catch (error) {
      throw new Error('Invalid timezone for ' + id + ': ' + timezone);
    }
    return { user_id: id, drive_folder_id: folder, timezone };
  });
}

function kudosLogKey_(userId, fileId) {
  return userId + ':' + fileId;
}

function kudosDigestKey_(userId, digest) {
  return userId + ':' + digest;
}

/**
 * Called by Apps Script triggers, or manually to test two user folders.
 * Each run respects both a file budget and a runtime budget.
 */
function syncAllActivities() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log('Kudos sync skipped: another execution owns the lock.');
    return;
  }

  const startedMs = Date.now();
  const syncId = Utilities.getUuid();
  const stats = {
    sync_id: syncId,
    started_at: kudosNowIso_(),
    finished_at: '',
    users_scanned: 0,
    files_imported: 0,
    files_duplicate: 0,
    files_skipped: 0,
    files_error: 0,
    notes: '',
  };

  try {
    const ss = kudosOpenSpreadsheet_();
    kudosEnsureSheets_(ss);
    const settings = kudosSettings_(ss);
    const users = kudosValidateUsers_(
      kudosReadObjects_(ss.getSheetByName('Users'), KUDOS_SHEETS.Users)
    );

    const importSheet = ss.getSheetByName('ImportLog');
    const activitySheet = ss.getSheetByName('Activities');
    const activityRows = kudosReadObjects_(activitySheet, KUDOS_SHEETS.Activities);
    const oldImportRows = kudosReadObjects_(importSheet, KUDOS_SHEETS.ImportLog);
    const importIndex = new Map();
    const activityIndex = new Map();
    const contentIndex = new Map();
    const notes = [];

    for (const row of oldImportRows) {
      importIndex.set(
        kudosLogKey_(kudosText_(row.user_id), kudosText_(row.drive_file_id)), row
      );
    }
    for (const row of activityRows) {
      const userId = kudosText_(row.user_id);
      activityIndex.set(
        kudosLogKey_(userId, kudosText_(row.drive_file_id)), row
      );
      if (row.source_hash) {
        contentIndex.set(kudosDigestKey_(userId, kudosText_(row.source_hash)), row);
      }
    }

    // Rotate starting user so one large folder cannot starve the others.
    const props = PropertiesService.getScriptProperties();
    const startUser = users.length
      ? (Number(props.getProperty('KUDOS_NEXT_USER_INDEX')) || 0) % users.length : 0;
    const orderedUsers = users.slice(startUser).concat(users.slice(0, startUser));
    const nextUser = users.length ? (startUser + 1) % users.length : 0;
    let attemptsThisRun = 0;
    let outOfBudget = false;

    for (const user of orderedUsers) {
      if (attemptsThisRun >= settings.maxFiles ||
          Date.now() - startedMs > settings.budgetMs) {
        outOfBudget = true;
        break;
      }
      stats.users_scanned++;
      let files;
      try {
        files = DriveApp.getFolderById(user.drive_folder_id).getFiles();
      } catch (error) {
        stats.files_error++;
        notes.push(user.user_id + ': folder unavailable (' + String(error).slice(0, 150) + ')');
        continue;
      }

      while (files.hasNext()) {
        if (attemptsThisRun >= settings.maxFiles ||
            Date.now() - startedMs > settings.budgetMs) {
          outOfBudget = true;
          break;
        }

        const file = files.next();
        const fileId = file.getId();
        const filename = file.getName();
        const modifiedAt = file.getLastUpdated().toISOString();
        const size = file.getSize();
        const key = kudosLogKey_(user.user_id, fileId);
        const old = importIndex.get(key) || null;

        // A rename or overwrite changes LastUpdated. Files with parse errors
        // can be retried twice, then require an edit or manual reset.
        const unchanged = old && kudosText_(old.modified_at) === modifiedAt &&
          Number(old.size_bytes) === Number(size);
        const complete = ['imported', 'duplicate', 'unsupported', 'rejected'];
        if (unchanged && (
          complete.includes(kudosText_(old.status)) ||
          (kudosText_(old.status) === 'error' && Number(old.attempts) >= 3)
        )) {
          stats.files_skipped++;
          continue;
        }

        attemptsThisRun++;
        const now = kudosNowIso_();
        const base = {
          user_id: user.user_id,
          drive_file_id: fileId,
          filename: filename,
          modified_at: modifiedAt,
          size_bytes: size,
          source_hash: '',
          activity_id: '',
          status: '',
          attempts: unchanged ? Number(old.attempts || 0) + 1 : 1,
          error: '',
          processed_at: now,
        };

        try {
          if (size > settings.maxBytes) {
            const error = new Error('File exceeds max_file_mb.');
            error.rejected = true;
            throw error;
          }

          const blob = file.getBlob();
          const bytes = blob.getBytes();
          const digest = kudosSha256_(bytes);
          base.source_hash = digest;

          const existing = contentIndex.get(kudosDigestKey_(user.user_id, digest));
          if (existing && kudosText_(existing.drive_file_id) !== fileId) {
            base.activity_id = kudosText_(existing.activity_id);
            base.status = 'duplicate';
            stats.files_duplicate++;
          } else {
            // File name and extension are not used for format identification.
            const xml = blob.getDataAsString('UTF-8');
            const parsed = kudosParseActivity_(xml, settings);
            const previousActivity = activityIndex.get(key) || null;

            const activityId = kudosSaveActivity_(
              activitySheet, previousActivity, parsed, user, file, digest, settings, now
            );
            base.activity_id = activityId;
            base.status = 'imported';
            stats.files_imported++;

            const newActivity = {
              activity_id: activityId, drive_file_id: fileId, user_id: user.user_id,
              source_hash: digest, _row: activitySheet.getLastRow(),
            };
            activityIndex.set(key, newActivity);
            contentIndex.set(kudosDigestKey_(user.user_id, digest), newActivity);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          base.error = message.slice(0, 450);
          base.status = error && error.unsupported ? 'unsupported' :
            error && error.rejected ? 'rejected' : 'error';
          if (base.status === 'error') stats.files_error++;
          else stats.files_skipped++;
          Logger.log('Kudos ' + user.user_id + ' import: ' + base.error);
        }

        const writeIndex = old && old._row;
        kudosWriteRow_(importSheet, KUDOS_SHEETS.ImportLog, base, writeIndex);
        importIndex.set(key, Object.assign({}, base, {
          _row: writeIndex || importSheet.getLastRow(),
        }));
      }
    }

    if (users.length) {
      props.setProperty('KUDOS_NEXT_USER_INDEX', String(nextUser));
    }
    const overridden = kudosApplyOverrides_(activitySheet);
    if (overridden) notes.push('Updated overrides: ' + overridden);
    if (outOfBudget) notes.push('Paused at the runtime/file budget; next run resumes.');
    stats.notes = notes.join('; ');
    Logger.log(
      'Kudos sync imported=' + stats.files_imported +
      ' duplicate=' + stats.files_duplicate +
      ' errors=' + stats.files_error
    );
  } catch (error) {
    stats.files_error++;
    stats.notes = ('Sync aborted: ' + String(error)).slice(0, 450);
    Logger.log(stats.notes);
    throw error;
  } finally {
    stats.finished_at = kudosNowIso_();
    try {
      const ss = kudosOpenSpreadsheet_();
      const sheet = ss.getSheetByName('SyncLog');
      if (sheet) kudosWriteRow_(sheet, KUDOS_SHEETS.SyncLog, stats);
    } catch (logError) {
      Logger.log('Could not write SyncLog: ' + logError);
    }
    lock.releaseLock();
  }
}

/** Print user ID and import summary without logging private GPS coordinates. */
function checkKudosSetup() {
  const ss = kudosOpenSpreadsheet_();
  kudosEnsureSheets_(ss);
  const users = kudosValidateUsers_(
    kudosReadObjects_(ss.getSheetByName('Users'), KUDOS_SHEETS.Users)
  );
  for (const user of users) {
    // Verify the owner's token has read permission to each shared folder.
    const folder = DriveApp.getFolderById(user.drive_folder_id);
    Logger.log(user.user_id + ' => ' + folder.getName() + ' [OK]');
  }
  Logger.log('Active users: ' + users.length);
}
