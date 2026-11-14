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
      };
    } },
    DriveApp: { getFolderById(id) {
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
  assert.equal(parsed.sportDetected, 'Run');
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
  assert.equal(evaluate("kudosInferSport_('', 2, 5000).sport"), 'Run');
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
