/**
 * GPX 1.0/1.1 and Garmin TCX parsing.
 *
 * Parsed GPS points are held in memory only while computing private statistics.
 * No coordinates are written to Sheets or published to GitHub Pages.
 */

function kudosChild_(element, name) {
  return element ? element.getChild(name, element.getNamespace()) : null;
}

function kudosChildren_(element, name) {
  return element ? element.getChildren(name, element.getNamespace()) : [];
}

function kudosChildText_(element, name) {
  const child = kudosChild_(element, name);
  return child ? kudosText_(child.getText()) : '';
}

function kudosAttr_(element, name) {
  const attr = element ? element.getAttribute(name) : null;
  return attr ? kudosText_(attr.getValue()) : '';
}

function kudosTimestamp_(raw) {
  const text = kudosText_(raw);
  if (!text) return null;
  // A timezone-less timestamp is interpreted as UTC, not the script host TZ.
  const normalized = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(text)
    ? text : text + 'Z';
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

function kudosNumber_(text) {
  const input = kudosText_(text);
  if (input === '') return null;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

function kudosHeartRate_(element) {
  const hr = kudosChild_(element, 'HeartRateBpm');
  if (hr) return kudosNumber_(kudosChildText_(hr, 'Value'));
  const extensions = kudosChild_(element, 'extensions') || kudosChild_(element, 'Extensions');
  if (!extensions) return null;
  const walk = (node, depth) => {
    if (depth > 6) return null;
    const name = node.getName().toLowerCase();
    if (name === 'hr' || name === 'heartrate' || name === 'heartratebpm') {
      const direct = kudosNumber_(node.getText());
      if (direct !== null && direct > 0) return direct;
    }
    for (const child of node.getChildren()) {
      const value = walk(child, depth + 1);
      if (value !== null) return value;
    }
    return null;
  };
  return walk(extensions, 0);
}

function kudosTrackpoint_(element, kind) {
  let lat = null;
  let lng = null;
  let ele = null;
  let time = null;
  let hr = null;

  if (kind === 'gpx') {
    lat = kudosNumber_(kudosAttr_(element, 'lat'));
    lng = kudosNumber_(kudosAttr_(element, 'lon'));
    ele = kudosNumber_(kudosChildText_(element, 'ele'));
    time = kudosTimestamp_(kudosChildText_(element, 'time'));
    hr = kudosHeartRate_(element);
  } else {
    const position = kudosChild_(element, 'Position');
    lat = kudosNumber_(kudosChildText_(position, 'LatitudeDegrees'));
    lng = kudosNumber_(kudosChildText_(position, 'LongitudeDegrees'));
    ele = kudosNumber_(kudosChildText_(element, 'AltitudeMeters'));
    time = kudosTimestamp_(kudosChildText_(element, 'Time'));
    hr = kudosHeartRate_(element);
  }

  if (lat === null || lng === null ||
      Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, ele, time, hr };
}

function kudosParseGpx_(root) {
  const segments = [];
  let activityName = '';
  let sportHint = '';
  for (const track of kudosChildren_(root, 'trk')) {
    if (!activityName) activityName = kudosChildText_(track, 'name');
    if (!sportHint) sportHint = kudosChildText_(track, 'type');
    for (const segment of kudosChildren_(track, 'trkseg')) {
      const points = kudosChildren_(segment, 'trkpt')
        .map((element) => kudosTrackpoint_(element, 'gpx'))
        .filter((point) => point !== null);
      if (points.length) segments.push(points);
    }
  }

  // Route GPX files are supported if no track segments are available.
  if (!segments.length) {
    for (const route of kudosChildren_(root, 'rte')) {
      if (!activityName) activityName = kudosChildText_(route, 'name');
      if (!sportHint) sportHint = kudosChildText_(route, 'type');
      const points = kudosChildren_(route, 'rtept')
        .map((element) => kudosTrackpoint_(element, 'gpx'))
        .filter((point) => point !== null);
      if (points.length) segments.push(points);
    }
  }

  const metadata = kudosChild_(root, 'metadata');
  const fallbackStart = kudosTimestamp_(
    kudosChildText_(metadata, 'time') || kudosChildText_(root, 'time')
  );
  return {
    format: 'GPX',
    segments,
    name: activityName || kudosChildText_(metadata, 'name'),
    sportHint,
    fallbackStart,
    fallbackSeconds: null,
  };
}

function kudosParseTcx_(root) {
  const segments = [];
  let sportHint = '';
  let fallbackStart = null;
  let fallbackSeconds = 0;
  let activityName = '';
  const activitiesNode = kudosChild_(root, 'Activities');

  for (const activity of kudosChildren_(activitiesNode, 'Activity')) {
    if (!sportHint) sportHint = kudosAttr_(activity, 'Sport');
    if (!activityName) activityName = kudosChildText_(activity, 'Id');
    const activityStart = kudosTimestamp_(kudosChildText_(activity, 'Id'));
    if (activityStart !== null &&
        (fallbackStart === null || activityStart < fallbackStart)) {
      fallbackStart = activityStart;
    }
    for (const lap of kudosChildren_(activity, 'Lap')) {
      const lapStart = kudosTimestamp_(kudosAttr_(lap, 'StartTime'));
      if (lapStart !== null &&
          (fallbackStart === null || lapStart < fallbackStart)) {
        fallbackStart = lapStart;
      }
      fallbackSeconds += kudosNumber_(kudosChildText_(lap, 'TotalTimeSeconds')) || 0;
      for (const track of kudosChildren_(lap, 'Track')) {
        const points = kudosChildren_(track, 'Trackpoint')
          .map((element) => kudosTrackpoint_(element, 'tcx'))
          .filter((point) => point !== null);
        if (points.length) segments.push(points);
      }
    }
  }
  return {
    format: 'TCX',
    segments,
    name: activityName,
    sportHint,
    fallbackStart,
    fallbackSeconds,
  };
}

function kudosRadians_(degrees) {
  return degrees * Math.PI / 180;
}

function kudosHaversine_(a, b) {
  const dLat = kudosRadians_(b.lat - a.lat);
  const dLng = kudosRadians_(b.lng - a.lng);
  const lat1 = kudosRadians_(a.lat);
  const lat2 = kudosRadians_(b.lat);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function kudosInferSport_(hint, speedMetersPerSecond, distanceMeters) {
  const type = kudosText_(hint).toLowerCase();
  if (/(golf)/.test(type)) {
    return { sport: 'Golf', confidence: 'explicit' };
  }
  if (/(running|jogging|walking|hiking|walk|hike|run|footing)/.test(type)) {
    return { sport: 'Walk', confidence: 'explicit' };
  }
  if (/(biking|cycling|bicycle|bike|ride|velocipede)/.test(type)) {
    return { sport: 'Ride', confidence: 'explicit' };
  }
  const speedKmh = speedMetersPerSecond * 3.6;
  // Deliberately ambiguous around brisk running and low-speed cycling.
  if (speedKmh >= 18) return { sport: 'Ride', confidence: 'inferred' };
  if (speedKmh >= 3 && speedKmh <= 11 && distanceMeters <= 25000) {
    return { sport: 'Walk', confidence: 'inferred' };
  }
  return { sport: 'Unknown', confidence: 'unknown' };
}

function kudosAnalyzeSegments_(input, settings) {
  let distance = 0;
  let moving = 0;
  let gain = 0;
  let earliest = null;
  let latest = null;
  let pointCount = 0;
  let heartSum = 0;
  let heartCount = 0;

  for (const segment of input.segments) {
    let prev = null;
    for (const point of segment) {
      pointCount++;
      if (point.time !== null) {
        if (earliest === null || point.time < earliest) earliest = point.time;
        if (latest === null || point.time > latest) latest = point.time;
      }
      if (point.hr !== null && point.hr >= 30 && point.hr <= 240) {
        heartSum += point.hr;
        heartCount++;
      }
      if (prev !== null) {
        const meters = kudosHaversine_(prev, point);
        const delta = point.time !== null && prev.time !== null
          ? (point.time - prev.time) / 1000 : null;
        const plausible = delta === null
          ? meters < 500
          : delta > 0 && meters / delta <= settings.maxSpeed;

        // Keep individual track segments separate and discard GPS jumps.
        if (plausible && meters < 5000) {
          distance += meters;
          if (delta !== null && delta <= settings.maxMovingGap &&
              meters / delta >= settings.minMovingSpeed) {
            moving += delta;
          }
          if (prev.ele !== null && point.ele !== null &&
              meters > 3 && point.ele - prev.ele >= 3 &&
              point.ele - prev.ele < 50) {
            gain += point.ele - prev.ele;
          }
        }
      }
      prev = point;
    }
  }

  if (pointCount < 2 || distance <= 0) {
    throw new Error('GPX/TCX has no usable GPS track (at least two coordinates required).');
  }
  const start = earliest === null ? input.fallbackStart : earliest;
  if (start === null) {
    throw new Error('Activity start time is missing from the GPX/TCX.');
  }

  const elapsed = earliest !== null && latest !== null
    ? Math.max(0, (latest - earliest) / 1000)
    : input.fallbackSeconds || 0;
  const movingSeconds = moving > 0 ? moving : (input.fallbackSeconds || 0);
  const speed = movingSeconds > 0 ? distance / movingSeconds : 0;
  const sport = kudosInferSport_(input.sportHint, speed, distance);

  return {
    format: input.format,
    name: input.name,
    startUtc: new Date(start).toISOString(),
    distanceMeters: distance,
    movingSeconds,
    elapsedSeconds: elapsed,
    elevationGainMeters: gain,
    averageHeartRate: heartCount ? heartSum / heartCount : null,
    sportDetected: sport.sport,
    sportConfidence: sport.confidence,
  };
}

/**
 * Fast-path for ordinary GPX trackpoints. XmlService can take minutes to build
 * an object tree for multi-megabyte Garmin recordings; this reader extracts
 * only the tiny subset of data that Kudos needs.
 *
 * Invalid/unusual GPX falls back to XmlService in kudosParseActivity_.
 */
function kudosParseGpxFast_(source) {
  const xml = String(source).replace(/^\uFEFF/, '');
  if (!/<(?:[\w.-]+:)?gpx(?:\s|>)/i.test(xml.slice(0, 3000))) return null;

  const tagText = (part, tag) => {
    const pattern = new RegExp(
      '<(?:[\\w.-]+:)?' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?' +
        tag + '\\s*>',
      'i'
    );
    const match = pattern.exec(part);
    return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
  };
  const pointPattern = /<(?:[\w.-]+:)?(?:trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?(?:trkpt|rtept)\s*>)/gi;
  const attribute = (attrs, key) => {
    const match = key === 'lat'
      ? /\blat\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)
      : /\blon\s*=\s*['"]([^'"]+)['"]/i.exec(attrs);
    return match ? kudosNumber_(match[1]) : null;
  };

  const parsePoints = (text) => {
    const result = [];
    pointPattern.lastIndex = 0;
    let match;
    while ((match = pointPattern.exec(text)) !== null) {
      const lat = attribute(match[1], 'lat');
      const lng = attribute(match[1], 'lon');
      if (lat === null || lng === null ||
          Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const body = match[2] || '';
      const ele = kudosNumber_(tagText(body, 'ele'));
      const time = kudosTimestamp_(tagText(body, 'time'));
      const hr = kudosNumber_(tagText(body, 'hr'));
      result.push({ lat, lng, ele, time, hr });
    }
    return result;
  };

  const segments = [];
  const segmentsPattern = /<(?:[\w.-]+:)?trkseg\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?trkseg\s*>/gi;
  let segment;
  while ((segment = segmentsPattern.exec(xml)) !== null) {
    const points = parsePoints(segment[1]);
    if (points.length) segments.push(points);
  }

  if (!segments.length) {
    const routePattern = /<(?:[\w.-]+:)?rte\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?rte\s*>/gi;
    let route;
    while ((route = routePattern.exec(xml)) !== null) {
      const points = parsePoints(route[1]);
      if (points.length) segments.push(points);
    }
  }
  if (!segments.length) return null;

  const track = /<(?:[\w.-]+:)?trk\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?trk\s*>/i.exec(xml);
  const route = /<(?:[\w.-]+:)?rte\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?rte\s*>/i.exec(xml);
  const metadata = /<(?:[\w.-]+:)?metadata\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?metadata\s*>/i.exec(xml);
  const activity = track ? track[1] : route ? route[1] : '';
  return {
    format: 'GPX',
    segments,
    name: tagText(activity, 'name') || tagText(metadata ? metadata[1] : '', 'name'),
    sportHint: tagText(activity, 'type'),
    fallbackStart: kudosTimestamp_(tagText(metadata ? metadata[1] : '', 'time')),
    fallbackSeconds: null,
  };
}

function kudosParseGpsSource_(xmlText) {
  const cleanText = String(xmlText).replace(/^\uFEFF/, '');
  const fast = kudosParseGpxFast_(cleanText);
  if (fast) return fast;
  const root = XmlService.parse(cleanText).getRootElement();
  const name = root.getName().toLowerCase();
  if (name === 'gpx') return kudosParseGpx_(root);
  if (name === 'trainingcenterdatabase') return kudosParseTcx_(root);
  const error = new Error('Unsupported XML root: ' + root.getName());
  error.unsupported = true;
  throw error;
}

function kudosParseActivity_(xmlText, settings) {
  return kudosAnalyzeSegments_(kudosParseGpsSource_(xmlText), settings);
}

function kudosSha256_(value) {
  const digest = Array.isArray(value)
    ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    : Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        String(value), Utilities.Charset.UTF_8
      );
  return digest.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}
