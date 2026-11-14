'use strict';

// No external test dependencies: execute the unchanged .gs sources in a
// Node VM with narrow mocks for the Apps Script services.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

const files = [
  'gas/00_Config.gs',
  'gas/01_Sheets.gs',
  'gas/02_Parser.gs',
  'gas/03_Sync.gs',
  'gas/04_Triggers.gs',
  'gas/05_PublicPreview.gs',
  'gas/06_BatchedPublish.gs',
];

class Element {
  constructor(name, children = [], text = '', attributes = {}) {
    this.name = name;
    this.children = children;
    this.text = text;
    this.attrs = attributes;
  }
  getName() { return this.name; }
  getText() { return this.text; }
  getNamespace() { return {}; }
  getChild(name) { return this.children.find(x => x.name === name) || null; }
  getChildren(name) {
    return name ? this.children.filter(x => x.name === name) : this.children;
  }
  getAttribute(name) {
    const value = this.attrs[name];
    return value === undefined ? null : { getValue() { return value; } };
  }
}

function point(lat, lng, seconds, offset = 0) {
  return new Element('trkpt', [
    new Element('ele', [], String(20 + offset)),
    new Element('time', [], new Date(Date.UTC(2026, 10, 14, 0, 0, seconds)).toISOString()),
  ], '', { lat: String(lat), lon: String(lng) });
}

function gpxRoot(sport = 'running') {
  return new Element('gpx', [
    new Element('trk', [
      new Element('name', [], 'Morning session'),
      new Element('type', [], sport),
      new Element('trkseg', [
        point(35, 139, 0),
        point(35.001, 139, 60, 5),
        point(35.002, 139, 120, 8),
      ]),
    ]),
  ]);
}

function tcxPoint(lat, lng, time) {
  return new Element('Trackpoint', [
    new Element('Time', [], time),
    new Element('Position', [
      new Element('LatitudeDegrees', [], String(lat)),
      new Element('LongitudeDegrees', [], String(lng)),
    ]),
  ]);
}

function tcxRoot() {
  return new Element('TrainingCenterDatabase', [
    new Element('Activities', [
      new Element('Activity', [
        new Element('Id', [], '2026-11-14T00:00:00Z'),
        new Element('Lap', [
          new Element('TotalTimeSeconds', [], '120'),
          new Element('Track', [
            tcxPoint(35, 139, '2026-11-14T00:00:00Z'),
            tcxPoint(35.002, 139, '2026-11-14T00:02:00Z'),
          ]),
        ], '', { StartTime: '2026-11-14T00:00:00Z' }),
      ], '', { Sport: 'Biking' }),
    ]),
  ]);
}

class FakeSheet {
  constructor() { this.rows = []; }
  getLastRow() { return this.rows.length; }
  getRange(r, c, h = 1, w = 1) {
    const self = this;
    return {
      getValues() {
        return Array.from({ length: h }, (_, i) =>
          Array.from({ length: w }, (_, j) => self.rows[r + i - 1]?.[c + j - 1] ?? '')
        );
      },
      getDisplayValues() {
        return this.getValues().map(row => row.map(value => String(value)));
      },
      setValues(values) {
        for (let i = 0; i < values.length; i++) {
          const row = r + i - 1;
          self.rows[row] ||= [];
          for (let j = 0; j < values[i].length; j++) {
            self.rows[row][c + j - 1] = values[i][j];
          }
        }
        return this;
      },
      setValue(value) { return this.setValues([[value]]); },
      setBackground() { return this; },
      setFontColor() { return this; },
      setFontWeight() { return this; },
    };
  }
  setFrozenRows() {}
  setColumnWidths() {}
  setColumnWidth() {}
}

class FakeSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new FakeSheet();
    this.sheets.set(name, sheet);
    return sheet;
  }
}

function createFixture() {
  const ss = new FakeSpreadsheet();
  const props = new Map([['KUDOS_SPREADSHEET_ID', 'private-test-sheet']]);
  const folders = new Map();
  const documents = new Map([
    ['run-gpx', gpxRoot()],
    ['bike-tcx', tcxRoot()],
  ]);
  const context = vm.createContext({
    console,
    Date,
    Math,
    Number,
    String,
    Array,
    Set,
    Map,
    JSON,
    Object,
    Logger: { log() {} },
    SpreadsheetApp: { openById(id) {
      assert.equal(id, 'private-test-sheet');
      return ss;
    } },
    PropertiesService: { getScriptProperties() {
      return {
        getProperty: key => props.get(key) || null,
        setProperty: (key, value) => props.set(key, value),
        deleteProperty: (key) => props.delete(key),
      };
    } },
    DriveApp: {
      getFileById(id) {
        if (id === 'tracked-gpx') return fakeFile('tracked-gpx', 'run-gpx');
        if (id === 'tracked-tcx') return fakeFile('tracked-tcx', 'bike-tcx');
        if (/^tracked-gpx-[0-9]+$/.test(id)) return fakeFile(id, 'run-gpx');
        throw new Error('File not shared');
      },
      getFolderById(id) {
      const files = folders.get(id);
      if (!files) throw new Error('Folder not shared');
      return {
        getName: () => id,
        getFiles() {
          let index = 0;
          return {
            hasNext: () => index < files.length,
            next: () => files[index++],
          };
        },
      };
    } },
    LockService: { getScriptLock() {
      return { tryLock: () => true, releaseLock() {} };
    } },
    Utilities: {
      Charset: { UTF_8: 'utf8' },
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest(_algorithm, value) {
        const buffer = Array.isArray(value)
          ? Buffer.from(value.map(b => (b + 256) % 256))
          : Buffer.from(String(value), 'utf8');
        return Array.from(crypto.createHash('sha256').update(buffer).digest())
          .map(b => b > 127 ? b - 256 : b);
      },
      formatDate(date) {
        return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 19);
      },
      getUuid: () => 'test-' + crypto.randomUUID(),
    },
    XmlService: { parse(xml) {
      const node = documents.get(xml);
      if (!node) return { getRootElement: () => new Element('notgpx') };
      return { getRootElement: () => node };
    } },
  });
  for (const name of files) {
    new vm.Script(fs.readFileSync(name, 'utf8'), { filename: name })
      .runInContext(context);
  }
  const evaluate = (expr, vars = {}) => {
    Object.assign(context, vars);
    return vm.runInContext(expr, context);
  };
  return { ss, folders, context, evaluate };
}

function fakeFile(id, content) {
  const bytes = Buffer.from(content);
  return {
    getId: () => id,
    getName: () => id + '.gpx',
    getLastUpdated: () => new Date('2026-11-14T12:00:00Z'),
    getSize: () => bytes.length,
    getBlob: () => ({
      getBytes: () => Array.from(bytes).map(b => b > 127 ? b - 256 : b),
      getDataAsString: () => content,
    }),
  };
}

test('parser handles valid GPX and explicit run sport', () => {
  const { evaluate } = createFixture();
  const parsed = evaluate("kudosParseActivity_('run-gpx', _settings)", {
    _settings: { maxSpeed: 45, maxMovingGap: 180, minMovingSpeed: 0.5 },
  });
  assert.equal(parsed.format, 'GPX');
  assert.equal(parsed.sportDetected, 'Walk');
  assert.equal(parsed.sportConfidence, 'explicit');
  assert.equal(parsed.startUtc, '2026-11-14T00:00:00.000Z');
  assert.ok(parsed.distanceMeters > 200 && parsed.distanceMeters < 240);
  assert.equal(parsed.movingSeconds, 120);
  assert.equal(parsed.elevationGainMeters, 8);
});

test('TCX sport metadata has priority over speed heuristics', () => {
  const { evaluate } = createFixture();
  const parsed = evaluate("kudosParseActivity_('bike-tcx', _settings)", {
    _settings: { maxSpeed: 45, maxMovingGap: 180, minMovingSpeed: 0.5 },
  });
  assert.equal(parsed.format, 'TCX');
  assert.equal(parsed.sportDetected, 'Ride');
  assert.equal(parsed.sportConfidence, 'explicit');
  assert.ok(parsed.distanceMeters > 200);
});

test('blank position fields do not become valid coordinates at 0,0', () => {
  const { evaluate } = createFixture();
  assert.equal(evaluate("kudosNumber_('')"), null);
  assert.equal(evaluate("kudosNumber_('3.4')"), 3.4);
  assert.equal(evaluate("kudosTrackpoint_(_bad, 'gpx')", {
    _bad: new Element('trkpt', [], '', { lat: '', lon: '' }),
  }), null);
});

test('sport detection preserves ambiguous cases for manual review', () => {
  const { evaluate } = createFixture();
  assert.equal(evaluate("kudosInferSport_('', 3.5, 10000).sport"), 'Unknown');
  assert.equal(evaluate("kudosInferSport_('', 6.1, 40000).sport"), 'Ride');
  assert.equal(evaluate("kudosInferSport_('', 2, 5000).sport"), 'Walk');
});

test('formula-like GPX names are escaped before storage', () => {
  const { evaluate } = createFixture();
  assert.equal(evaluate("kudosSheetCell_('=HYPERLINK(1)')"), "'=HYPERLINK(1)");
});

test('two users are isolated by folder and source checksum', () => {
  const { ss, folders, evaluate } = createFixture();
  evaluate('setupSheets()');
  const userSheet = ss.getSheetByName('Users');
  userSheet.getRange(2, 1, 2, 6).setValues([
    ['alice', 'Alice', 'a@example.com', 'folderA', 'Asia/Tokyo', true],
    ['bob', 'Bob', 'b@example.com', 'folderB', 'Asia/Tokyo', true],
  ]);
  folders.set('folderA', [
    fakeFile('a1', 'run-gpx'),
    fakeFile('a2', 'run-gpx'),
  ]);
  folders.set('folderB', [fakeFile('b1', 'run-gpx')]);

  evaluate('syncAllActivities()');
  const acts = ss.getSheetByName('Activities');
  const logs = ss.getSheetByName('ImportLog');
  assert.equal(acts.getLastRow(), 3, 'two distinct users get separate activity rows');
  assert.equal(logs.getLastRow(), 4, 'one duplicate is logged');
  const statusColumn = 8;
  assert.deepEqual(
    logs.getRange(2, statusColumn, 3, 1).getValues().flat().sort(),
    ['duplicate', 'imported', 'imported']
  );

  evaluate('syncAllActivities()');
  assert.equal(acts.getLastRow(), 3, 'reruns do not create duplicate activities');
  assert.equal(logs.getLastRow(), 4, 'reruns update no unchanged file logs');

  const headers = acts.rows[0];
  const sportOverrideColumn = headers.indexOf('sport_override') + 1;
  const sportFinalColumn = headers.indexOf('sport_final') + 1;
  acts.getRange(2, sportOverrideColumn).setValue('Ride');
  evaluate('applyActivityOverrides()');
  assert.equal(acts.getRange(2, sportFinalColumn).getValues()[0][0], 'Ride');
});

test('preview keeps spreadsheet display names without exporting account credentials', () => {
  const { evaluate } = createFixture();
  const users = [
    {
      user_id: 'private_alice', display_name: 'Actual Name',
      email: 'a@private.example', drive_folder_id: 'sensitive_folder',
      timezone: 'Asia/Tokyo', enabled: true,
    },
    {
      user_id: 'private_bob', display_name: 'Second Name',
      email: 'b@private.example', drive_folder_id: 'other_folder',
      timezone: 'Asia/Tokyo', enabled: false,
    },
  ];
  const records = [{
    user_id: 'private_alice',
    activity_id: 'sensitive_activity_id',
    filename: 'home-to-office.gpx',
    drive_file_id: 'secretfile',
    source_hash: 'private-source-hash',
    name: 'Private Track near home',
    name_override: 'Hospital visit',
    sport_final: 'Ride',
    review_status: 'ok',
    distance_m: 78001,
    moving_time_s: 7215,
    elevation_gain_m: 138,
    start_at_utc: '2026-11-14T12:30:00Z',
    average_hr_bpm: 175,
    prefecture_override: '東京都',
    route_visibility: 'stats',
    summary_polyline: 'privategps',
  }];
  const result = evaluate(
    'kudosBuildPublicPreview_(_users, _records, _ids, _precision, _now)',
    {
      _users: users, _records: records, _ids: ['private_alice'],
      _precision: 'month', _now: '2026-11-14T12:00:00Z',
    }
  );
  assert.equal(result.activities.length, 1);
  assert.equal(result.users.length, 1);
  assert.equal(result.users[0].user_id, 'u01');
  assert.equal(result.users[0].display_name, 'Actual Name');
  const activity = result.activities[0];
  assert.equal(activity.user_id, 'u01');
  assert.equal(activity.summary_polyline, null);
  assert.equal(activity.location_country, '東京都');
  assert.equal(activity.average_heartrate, null);
  assert.equal(activity.name, 'Hospital visit');
  assert.ok(activity.start_date_local.startsWith('2026-11-'));
  assert.ok(activity.start_date_local.endsWith('T12:00:00'));
  assert.equal(activity.distance, 78000);

  const json = JSON.stringify(result);
  for (const forbidden of [
    'private_alice', 'private_bob', 'a@private.example',
    'home-to-office', 'privategps', 'sensitive_folder', 'secretfile', 'private-source-hash',
    'sensitive_activity_id',
  ]) {
    assert.equal(json.includes(forbidden), false, forbidden + ' must be redacted');
  }
});

test('public preview is disabled until the owner opts in explicitly', () => {
  const { evaluate } = createFixture();
  evaluate('setupSheets()');
  assert.throws(
    () => evaluate('kudosPreparePublicPreview_()'),
    /Public preview is disabled/
  );
});

test('public preview rejects publishing disabled users', () => {
  const { evaluate } = createFixture();
  assert.throws(
    () => evaluate('kudosBuildPublicPreview_(_users, [], _ids, "month", "now")', {
      _users: [{ user_id: 'alice', enabled: false }],
      _ids: ['alice'],
    }),
    /not enabled/
  );
});

test('preview carries real display names and activity labels while withholding source IDs', () => {
  const { evaluate } = createFixture();
  const privateUsers = [
    {
      user_id: 'private_account',
      display_name: 'Real Person',
      email: 'private@example.org',
      drive_folder_id: 'private-folder',
      timezone: 'Asia/Tokyo',
      enabled: true,
    },
  ];
  const privateActivities = [{
    activity_id: 'private-activity-id',
    run_id: 123,
    user_id: 'private_account',
    drive_file_id: 'file-123',
    filename: 'my-home-track.gpx',
    source_hash: 'secret-checksum',
    name: 'My private home route',
    name_override: 'Doctor visit',
    sport_final: 'Ride',
    review_status: 'ok',
    distance_m: 78057,
    moving_time_s: 7203,
    elevation_gain_m: 122,
    average_hr_bpm: 155,
    start_at_utc: '2022-07-22T23:30:00.000Z',
    prefecture_override: '東京都',
    route_visibility: 'route',
    summary_polyline: 'SECRET_GPS',
  }];
  const obj = evaluate('kudosBuildPublicPreview_(_users, _acts, _approved, "month", _now)', {
    _users: privateUsers,
    _acts: privateActivities,
    _approved: ['private_account'],
    _now: '2026-11-14T12:00:00Z',
  });
  assert.equal(obj.mode, 'public-stats-preview');
  assert.equal(obj.users[0].user_id, 'u01');
  assert.equal(obj.users[0].display_name, 'Real Person');
  assert.equal(obj.activities.length, 1);
  const activity = obj.activities[0];
  assert.equal(activity.type, 'Ride');
  assert.equal(activity.name, 'Doctor visit');
  assert.equal(activity.user_id, 'u01');
  assert.equal(activity.distance, 78100);
  assert.equal(activity.summary_polyline, null);
  assert.equal(activity.location_country, '東京都');
  assert.equal(activity.average_heartrate, null);
  assert.equal(activity.start_date_local.slice(0, 7), '2022-07');
  assert.ok(activity.start_date_local.endsWith('T12:00:00'));
  const json = JSON.stringify(obj);
  for (const marker of [
    'private_account', 'private@example.org',
    'private-folder', 'private-activity-id', 'file-123',
    'my-home-track', 'secret-checksum', 'private home route',
    'SECRET_GPS',
  ]) {
    assert.equal(json.includes(marker), false, marker + ' must not be exported');
  }
});

test('public export defaults to disabled and requires an allowlist', () => {
  const { evaluate, ss } = createFixture();
  evaluate('setupSheets()');
  assert.throws(() => evaluate('kudosPreparePublicPreview_()'), /Public preview is disabled/);
  const settings = ss.getSheetByName('Settings');
  const rows = settings.rows;
  const approval = rows.findIndex((r) => r[0] === 'public_preview_export_approval');
  assert.ok(approval >= 0);
  settings.getRange(approval + 1, 2).setValue('I_APPROVE_PUBLIC_STATS');
  assert.throws(() => evaluate('kudosPreparePublicPreview_()'), /public_preview_user_ids/);
});

test('unknown sport and activities needing review are omitted', () => {
  const { evaluate } = createFixture();
  const users = [{ user_id: 'u1', enabled: true, timezone: 'Asia/Tokyo' }];
  const acts = [
    { user_id: 'u1', review_status: 'needs_review', sport_final: 'Ride', start_at_utc: '2026-11-01T00:00:00Z', distance_m: 1000, moving_time_s: 300 },
    { user_id: 'u1', review_status: 'ok', sport_final: 'Unknown', start_at_utc: '2026-11-01T00:00:00Z', distance_m: 1000, moving_time_s: 300 },
  ];
  const p = evaluate('kudosBuildPublicPreview_(_users, _acts, ["u1"], "month", "now")', {
    _users: users, _acts: acts,
  });
  assert.equal(p.activities.length, 0);
});

test('route encoder is compatible with Google polyline precision five', () => {
  const { evaluate } = createFixture();
  const result = evaluate('kudosEncodePolyline_(_points)', {
    _points: [
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ],
  });
  assert.equal(result, '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
});

test('route extractor resolves the original Drive files and keeps separate GPS segments', () => {
  const { evaluate } = createFixture();
  const routeRows = [{
    activity_id: 'a1', user_id: 'user_02', drive_file_id: 'tracked-gpx',
    review_status: 'ok', sport_final: 'Run',
  }, {
    activity_id: 'a2', user_id: 'user_02', drive_file_id: 'tracked-tcx',
    review_status: 'ok', sport_final: 'Ride',
  }];
  const routes = evaluate('kudosReadPreviewRoutes_(_rows, _users)', {
    _rows: routeRows,
    _users: ['user_02'],
  });
  assert.equal(routes.size, 2);
  for (const key of ['user_02:tracked-gpx', 'user_02:tracked-tcx']) {
    assert.equal(routes.get(key).length, 1);
    assert.ok(routes.get(key)[0].length > 10);
  }
  const projection = evaluate(
    'kudosBuildPublicPreview_(_people, _records, _selected, "exact", _now, _routes)',
    {
      _people: [{ user_id: 'user_02', display_name: 'Cyclist', enabled: true,
        timezone: 'Asia/Tokyo' }],
      _selected: ['user_02'],
      _records: routeRows.map((row, index) => ({
        ...row, start_at_utc: '2026-11-14T00:00:00Z',
        distance_m: 10000 + index * 1000,
        moving_time_s: 1200,
        elevation_gain_m: 20,
      })),
      _now: '2026-11-14T10:00:00Z',
      _routes: routes,
    }
  );
  assert.equal(projection.users[0].display_name, 'Cyclist');
  assert.equal(projection.activities.length, 2);
  assert.ok(projection.activities.every((a) =>
    typeof a.summary_polyline === 'string' && a.route_segments.length === 1
  ));
});

test('separate GPX track segments are encoded separately instead of joined', () => {
  const { evaluate } = createFixture();
  const segments = [
    [{ lat: 35, lng: 139 }, { lat: 35.001, lng: 139.002 }],
    [{ lat: 36, lng: 140 }, { lat: 36.001, lng: 140.002 }],
  ];
  const result = evaluate('kudosEncodeRouteSegments_(_segments)', { _segments: segments });
  assert.equal(result.length, 2);
  assert.ok(result[0] !== result[1]);
});

test('fast GPX parser reads track segments without XmlService object creation', () => {
  const { evaluate } = createFixture();
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">',
    '<trk><name>Cycling GPX</name><type>cycling</type><trkseg>',
    '<trkpt lat="35.00000" lon="139.00000"><ele>30</ele><time>2026-11-14T00:00:00Z</time></trkpt>',
    '<trkpt lat="35.00100" lon="139.00000"><ele>35</ele><time>2026-11-14T00:01:00Z</time><extensions><gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><gpxtpx:hr>142</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>',
    '<trkpt lat="35.00200" lon="139.00000"><ele>40</ele><time>2026-11-14T00:02:00Z</time></trkpt>',
    '</trkseg></trk></gpx>',
  ].join('');
  const result = evaluate('kudosParseActivity_(_xml, _settings)', {
    _xml: xml,
    _settings: { maxSpeed: 45, maxMovingGap: 180, minMovingSpeed: 0.5 },
  });
  assert.equal(result.format, 'GPX');
  assert.equal(result.name, 'Cycling GPX');
  assert.equal(result.sportDetected, 'Ride');
  assert.equal(result.movingSeconds, 120);
  assert.equal(result.elevationGainMeters, 10);
  assert.equal(result.averageHeartRate, 142);
  assert.ok(result.distanceMeters > 200);
});

test('GPX fast path preserves separate tracks and supports single quotes', () => {
  const { evaluate } = createFixture();
  const xml = '<gpx><trk><name>Two legs</name>' +
    `<trkseg><trkpt lat='35.0' lon='139.0'/><trkpt lat='35.001' lon='139.001'/></trkseg>` +
    '<trkseg><trkpt lat="36.0" lon="140.0"/><trkpt lat="36.001" lon="140.001"/></trkseg>' +
    '</trk></gpx>';
  const input = evaluate('kudosParseGpxFast_(_xml)', { _xml: xml });
  assert.equal(input.segments.length, 2);
  assert.equal(input.segments[0].length, 2);
  assert.equal(input.segments[1].length, 2);
});

test('manual import progress reports completed rows and never creates triggers', () => {
  const { evaluate, ss, folders } = createFixture();
  evaluate('setupSheets()');
  const users = ss.getSheetByName('Users');
  users.getRange(2, 1, 1, 6).setValues([
    ['alice', 'Alice', '', 'folderA', 'Asia/Tokyo', true],
  ]);
  folders.set('folderA', [fakeFile('a1', 'run-gpx')]);
  const run = evaluate('importNextManualBatch()');
  assert.equal(run.files_imported, 1);
  const summary = evaluate('showImportProgress()');
  assert.equal(summary.alice.imported, 1);
  const repeated = evaluate('importNextManualBatch()');
  assert.equal(repeated.files_imported, 0);
});


test('batched publisher stages routes as orphaned Git blobs before one final commit', () => {
  const { ss, context, evaluate } = createFixture();
  evaluate('setupSheets()');
  evaluate("PropertiesService.getScriptProperties().setProperty('KUDOS_GITHUB_TOKEN', 'test-token')");
  const settings = ss.getSheetByName('Settings');
  for (const row of settings.rows) {
    if (row[0] === 'public_preview_export_approval') row[1] = 'I_APPROVE_PUBLIC_STATS';
    if (row[0] === 'public_preview_user_ids') row[1] = 'user_02';
  }
  ss.getSheetByName('Users').getRange(2, 1, 1, 6)
    .setValues([['user_02', 'Cyclist', '', 'folderB', 'Asia/Tokyo', true]]);

  const activities = ss.getSheetByName('Activities');
  const headers = activities.rows[0];
  const activityRows = Array.from({ length: 11 }, (_, i) => {
    const record = {
      activity_id: 'a' + i,
      user_id: 'user_02',
      drive_file_id: 'tracked-gpx-' + i,
      name: 'Ride ' + i,
      start_at_utc: '2026-11-14T12:00:00Z',
      sport_final: 'Ride',
      review_status: 'ok',
      distance_m: 5000 + i * 100,
      moving_time_s: 1800,
      elevation_gain_m: 30,
    };
    return headers.map((header) => record[header] ?? '');
  });
  activities.getRange(2, 1, activityRows.length, headers.length)
    .setValues(activityRows);

  const staged = new Map();
  const requests = [];
  let serial = 1;
  const sha = () => String(serial++).padStart(40, '0');
  context.UrlFetchApp = { fetch(url, options) {
    const path = url.slice('https://api.github.com/repos/naoiw/kudos'.length);
    const body = options.payload ? JSON.parse(options.payload) : null;
    requests.push({ method: options.method, path, body });
    let response;
    if (path === '/git/blobs' && options.method === 'post') {
      const hash = sha();
      staged.set(hash, body.content);
      response = { sha: hash };
    } else if (path === '/git/ref/heads/main' && options.method === 'get') {
      response = { object: { sha: 'a'.repeat(40) } };
    } else if (path === '/git/commits/' + 'a'.repeat(40)) {
      response = { tree: { sha: 'b'.repeat(40) } };
    } else if (path === '/git/trees' && options.method === 'post') {
      response = { sha: 'c'.repeat(40) };
    } else if (path === '/git/commits' && options.method === 'post') {
      response = { sha: 'd'.repeat(40) };
    } else if (path === '/git/refs/heads/main' && options.method === 'patch') {
      response = { ref: 'refs/heads/main' };
    } else {
      throw new Error('Unexpected mock GitHub request: ' + path);
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(response) };
  } };

  const first = evaluate('publishApprovedPublicPreview()');
  assert.equal(first.processed, 8);
  assert.equal(first.published, false);
  assert.equal(requests.filter((r) => r.method === 'patch').length, 0,
    'main must not be updated before all chunks are ready');
  assert.equal(evaluate('showPublicPreviewProgress()').processed, 8);

  const second = evaluate('publishApprovedPublicPreview()');
  assert.equal(second.processed, 11);
  assert.equal(second.total, 11);
  assert.equal(second.published, true);
  assert.equal(second.chunks, 2);
  assert.equal(requests.filter((r) => r.path === '/git/refs/heads/main').length, 1);
  assert.equal(evaluate('showPublicPreviewProgress()').processed, 0,
    'checkpoint is cleaned after successful final publication');
  const tree = requests.find((r) => r.path === '/git/trees').body.tree;
  assert.equal(tree.length, 3);
  const chunkEntries = tree.filter((entry) => entry.path.includes('/exports/'));
  assert.equal(chunkEntries.length, 2);
  const chunkRoutes = chunkEntries.flatMap((entry) => JSON.parse(staged.get(entry.sha)).routes);
  assert.equal(chunkRoutes.length, 11);
  assert.ok(chunkRoutes.every((route) => Array.isArray(route.route_segments) &&
    route.route_segments.length > 0));
  const manifestEntry = tree.find((entry) => entry.path === 'public/data/preview.json');
  const manifest = JSON.parse(staged.get(manifestEntry.sha));
  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.activities.length, 11);
  assert.equal(manifest.route_chunks.length, 2);
  assert.equal(manifest.users[0].display_name, 'Cyclist');
  assert.equal(JSON.stringify(manifest).includes('tracked-gpx-'), false,
    'private Drive file IDs must not leave GAS');
  assert.deepEqual(chunkRoutes.map((row) => row.run_id).sort((a, b) => a - b),
    manifest.activities.map((row) => row.run_id).sort((a, b) => a - b));
});

test('changed workbook metadata requires an explicit reset before continuing', () => {
  const { ss, context, evaluate } = createFixture();
  evaluate('setupSheets()');
  evaluate("PropertiesService.getScriptProperties().setProperty('KUDOS_GITHUB_TOKEN', 'test-token')");
  const settings = ss.getSheetByName('Settings');
  for (const row of settings.rows) {
    if (row[0] === 'public_preview_export_approval') row[1] = 'I_APPROVE_PUBLIC_STATS';
    if (row[0] === 'public_preview_user_ids') row[1] = 'user_02';
  }
  ss.getSheetByName('Users').getRange(2, 1, 1, 6)
    .setValues([['user_02', 'Cyclist', '', 'folderB', 'Asia/Tokyo', true]]);
  const activities = ss.getSheetByName('Activities');
  const headers = activities.rows[0];
  const rows = Array.from({ length: 9 }, (_, i) => headers.map((column) => ({
    activity_id: 'a' + i,
    user_id: 'user_02', drive_file_id: 'tracked-gpx-' + i,
    name: 'Ride ' + i,
    start_at_utc: '2026-11-14T12:00:00Z', sport_final: 'Ride',
    review_status: 'ok', distance_m: 5000, moving_time_s: 1000,
  })[column] ?? ''));
  activities.getRange(2, 1, rows.length, headers.length).setValues(rows);

  context.UrlFetchApp = { fetch(_url, options) {
    if (options.method !== 'post') throw new Error('Should only stage a blob');
    return {
      getResponseCode: () => 201,
      getContentText: () => JSON.stringify({ sha: 'a'.repeat(40) }),
    };
  } };
  const one = evaluate('publishApprovedPublicPreview()');
  assert.equal(one.processed, 8);
  const nameColumn = headers.indexOf('name') + 1;
  activities.getRange(2, nameColumn).setValue('A changed ride');
  assert.equal(evaluate('showPublicPreviewProgress()').needs_reset, true);
  assert.throws(() => evaluate('publishApprovedPublicPreview()'), /resetPublicPreviewBatch/);
  evaluate('resetPublicPreviewBatch()');
  assert.equal(evaluate('showPublicPreviewProgress()').needs_reset, false);
});


test('activity names determine cycling, walking and golf categories before speed hints', () => {
  const { evaluate } = createFixture();
  const cases = [
    ['ゴルフ場 18ホール', 'Ride', 'Golf'],
    ['Golf practice', 'Run', 'Golf'],
    ['朝のサイクリング', 'Run', 'Ride'],
    ['多摩川ライド', 'Run', 'Ride'],
    ['Cycle Ride', 'Run', 'Ride'],
    ['ハイキング', 'Ride', 'Walk'],
    ['夕方のランニング', 'Ride', 'Walk'],
    ['ジョギング', 'Ride', 'Walk'],
    ['ウォーキング', 'Ride', 'Walk'],
    ['ウォーク', 'Ride', 'Walk'],
    ['散歩', 'Ride', 'Walk'],
    ['名前に手がかりなし', 'Run', 'Walk'],
    ['名前に手がかりなし', 'Ride', 'Ride'],
  ];
  for (const [name, detected, expected] of cases) {
    const resolved = evaluate('kudosResolveSport_(_name, _detected, "")', {
      _name: name, _detected: detected,
    });
    assert.equal(resolved.sport, expected, name);
  }
  const manual = evaluate('kudosResolveSport_("ゴルフ", "Ride", "Walk")');
  assert.equal(manual.sport, 'Walk', 'explicit override wins over title');
});

test('existing imported rows can be reclassified without reopening GPX files', () => {
  const { evaluate, ss } = createFixture();
  evaluate('setupSheets()');
  const sheet = ss.getSheetByName('Activities');
  const header = sheet.rows[0];
  const items = [
    { activity_id: 'a', name: '朝のゴルフ', sport_detected: 'Ride',
      sport_final: 'Ride', review_status: 'ok' },
    { activity_id: 'b', name: 'ハイキング', sport_detected: 'Ride',
      sport_final: 'Ride', review_status: 'ok' },
    { activity_id: 'c', name: 'ジョギング', sport_detected: 'Run',
      sport_final: 'Run', review_status: 'ok' },
    { activity_id: 'd', name: '朝のゴルフ', name_override: '多摩川サイクリング',
      sport_detected: 'Ride', sport_final: 'Ride', review_status: 'ok' },
    { activity_id: 'e', name: 'ゴルフ', sport_detected: 'Run',
      sport_override: 'Ride', sport_final: 'Ride', review_status: 'ok' },
    { activity_id: 'f', name: 'Unknown activity', sport_detected: 'Unknown',
      sport_final: 'Unknown', review_status: 'needs_review' },
    { activity_id: 'g', name: '新しいウォーキング',
      sport_detected: 'Unknown', sport_final: 'Unknown', review_status: 'needs_review' },
  ];
  sheet.getRange(2, 1, items.length, header.length).setValues(items.map((row) =>
    header.map((key) => row[key] ?? '')
  ));
  const changed = evaluate('applyActivityOverrides()');
  assert.ok(changed > 0);
  const f = header.indexOf('sport_final');
  const detected = header.indexOf('sport_detected');
  const status = header.indexOf('review_status');
  assert.deepEqual(sheet.rows.slice(1).map((row) => row[f]),
    ['Golf','Walk','Walk','Ride','Ride','Unknown','Walk']);
  assert.deepEqual(sheet.rows.slice(1).map((row) => row[detected]),
    ['Golf','Walk','Walk','Ride','Golf','Unknown','Walk']);
  assert.equal(sheet.rows[6][status], 'needs_review');
  assert.equal(sheet.rows[7][status], 'ok');
  assert.equal(evaluate('applyActivityOverrides()'), 0, 'second run is idempotent');
});

test('export detects golf in legacy Ride records without forcing a new GPX import', () => {
  const { evaluate } = createFixture();
  const rows = [
    { user_id: 'user_02', name: 'ゴルフ', sport_final: 'Ride', sport_detected: 'Ride',
      review_status: 'ok', start_at_utc: '2026-11-13T00:00:00Z',
      distance_m: 8500, moving_time_s: 11000, elevation_gain_m: 5 },
    { user_id: 'user_02', name: 'ウォーキング', sport_final: 'Run',
      sport_detected: 'Run', review_status: 'ok', start_at_utc: '2026-11-12T00:00:00Z',
      distance_m: 7000, moving_time_s: 5400, elevation_gain_m: 5 },
    { user_id: 'user_02', name: 'Unknown', sport_final: 'Unknown',
      sport_detected: 'Unknown', review_status: 'needs_review',
      start_at_utc: '2026-11-11T00:00:00Z', distance_m: 1000, moving_time_s: 900 },
  ];
  const result = evaluate(
    'kudosBuildPublicPreview_(_people, _activities, ["user_02"], "month", "now")',
    { _people: [{ user_id: 'user_02', display_name: 'Test', enabled: true,
      timezone: 'Asia/Tokyo' }], _activities: rows }
  );
  assert.equal(result.genre_version, 1);
  assert.deepEqual(result.activities.map((a) => a.type), ['Golf','Walk']);
  assert.equal(result.activities.length, 2);
});
