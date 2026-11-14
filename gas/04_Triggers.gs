/**
 * Time-driven schedules in Asia/Tokyo:
 * - One sync every day around 21:00.
 * - An extra sync on Saturday and Sunday around 13:00.
 *
 * Google Apps Script intentionally runs time triggers within a time window,
 * so these are not exact-minute execution guarantees.
 */
function installSyncTriggers() {
  const functionName = 'syncAllActivities';
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .inTimezone(KUDOS_TIMEZONE)
    .create();

  for (const day of [ScriptApp.WeekDay.SATURDAY, ScriptApp.WeekDay.SUNDAY]) {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .onWeekDay(day)
      .atHour(13)
      .inTimezone(KUDOS_TIMEZONE)
      .create();
  }

  Logger.log('Installed 3 Kudos sync triggers (daily evening + weekend afternoon).');
}

/**
 * Remove only the sync triggers created by this project.
 * setupSheets() and checkKudosSetup() are always manually invoked.
 */
function removeSyncTriggers() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'syncAllActivities') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  Logger.log('Kudos sync triggers removed.');
}
