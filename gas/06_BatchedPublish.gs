/**
 * Resumable GPX/TCX publishing that stays under Apps Script's per-execution
 * runtime. Route chunks are staged as UNREFERENCED Git blobs; GitHub Pages is
 * updated exactly once when every chunk is ready.
 *
 * No time-based triggers are installed here. Manual calls only.
 */
const KUDOS_PUBLISH_STATE_KEY = 'KUDOS_PUBLISH_V2_STATE';
const KUDOS_PUBLISH_CHUNK_KEY = 'KUDOS_PUBLISH_V2_CHUNK_';
const KUDOS_PUBLISH_BATCH_SIZE = 8;
const KUDOS_PUBLISH_RUNTIME_BUDGET_MS = 180000;

function kudosPublishChunkKey_(index) {
  return KUDOS_PUBLISH_CHUNK_KEY + String(index).padStart(5, '0');
}

function kudosGithubApi_(method, path, payload) {
  const token = PropertiesService.getScriptProperties()
    .getProperty('KUDOS_GITHUB_TOKEN');
  if (!token) throw new Error('Set Script Property KUDOS_GITHUB_TOKEN.');
  const options = {
    method: method.toLowerCase(),
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Kudos-GAS-Publisher',
    },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + KUDOS_PUBLIC_PREVIEW_REPO + path,
    options
  );
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('GitHub ' + method + ' ' + path +
      ' failed (' + status + '): ' + response.getContentText().slice(0, 350));
  }
  return JSON.parse(response.getContentText());
}

function kudosPublishSources_() {
  const ss = kudosOpenSpreadsheet_();
  kudosEnsureSheets_(ss);
  const selection = kudosPreviewSettings_(ss);
  const users = kudosReadObjects_(ss.getSheetByName('Users'), KUDOS_SHEETS.Users);
  const activities = kudosReadObjects_(
    ss.getSheetByName('Activities'), KUDOS_SHEETS.Activities
  );
  const sources = [];
  // A fixed generated_at value ensures repeatable snapshots across executions.
  const preview = kudosBuildPublicPreview_(
    users, activities, selection.userIds, selection.precision,
    'snapshot', null, sources
  );
  if (sources.some((source) => !source.file_id)) {
    throw new Error('One or more activities are missing Drive file IDs.');
  }
  const fingerprint = kudosSha256_(JSON.stringify({
    users: preview.users,
    activities: preview.activities,
    sources: sources,
    precision: selection.precision,
  }));
  return { preview, sources, fingerprint };
}

function kudosReadPublishState_(properties) {
  const raw = properties.getProperty(KUDOS_PUBLISH_STATE_KEY);
  if (!raw) return null;
  const state = JSON.parse(raw);
  if (
    typeof state.jobId !== 'string' ||
    !/^[a-z0-9]{16,48}$/.test(state.jobId) ||
    !Number.isInteger(state.next) ||
    !Number.isInteger(state.chunks) ||
    state.next < 0 || state.chunks < 0 ||
    typeof state.fingerprint !== 'string'
  ) {
    throw new Error('Malformed publish checkpoint. Call resetPublicPreviewBatch().');
  }
  return state;
}

function kudosWritePublishState_(properties, state) {
  properties.setProperty(KUDOS_PUBLISH_STATE_KEY, JSON.stringify(state));
}

function kudosPublishedRoute_(source) {
  const file = DriveApp.getFileById(source.file_id);
  const xml = file.getBlob().getDataAsString('UTF-8');
  const parsed = kudosParseGpsSource_(xml);
  const segments = kudosEncodeRouteSegments_(parsed.segments);
  if (!segments.length) {
    throw new Error('No valid route for run_id ' + source.run_id);
  }
  return {
    run_id: source.run_id,
    route_segments: segments,
  };
}

function kudosRouteChunkPath_(state, index) {
  return 'public/data/exports/' + state.jobId +
    '/chunk-' + String(index).padStart(4, '0') + '.json';
}

function kudosFinalizePublicPreview_(snapshot, state, properties) {
  // This is a metadata-only operation: no GPX is opened here.
  const chunks = [];
  const tree = [];
  for (let i = 0; i < state.chunks; i++) {
    const sha = properties.getProperty(kudosPublishChunkKey_(i));
    if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
      throw new Error('Missing staged route chunk ' + i + '; cannot finalize.');
    }
    const path = kudosRouteChunkPath_(state, i);
    chunks.push(path.slice('public/'.length));
    tree.push({ path, mode: '100644', type: 'blob', sha });
  }

  const manifest = Object.assign({}, snapshot.preview, {
    schema_version: 2,
    generated_at: kudosNowIso_(),
    route_chunks: chunks,
  });
  const manifestBlob = kudosGithubApi_('post', '/git/blobs', {
    content: JSON.stringify(manifest, null, 2) + '\n',
    encoding: 'utf-8',
  });
  if (!/^[0-9a-f]{40}$/.test(manifestBlob.sha || '')) {
    throw new Error('Invalid preview manifest blob SHA.');
  }
  tree.push({
    path: KUDOS_PUBLIC_PREVIEW_PATH,
    mode: '100644',
    type: 'blob',
    sha: manifestBlob.sha,
  });

  // Read the current main head only at finalization, so code changes made
  // during a long import are preserved. On ref conflicts, retry safely.
  const head = kudosGithubApi_('get', '/git/ref/heads/main');
  const commitSha = head.object && head.object.sha;
  if (!commitSha || !/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error('Unable to read the current main commit.');
  }
  const previous = kudosGithubApi_('get', '/git/commits/' + commitSha);
  const baseTreeSha = previous.tree && previous.tree.sha;
  if (!baseTreeSha) throw new Error('Unable to read the main tree.');

  const newTree = kudosGithubApi_('post', '/git/trees', {
    base_tree: baseTreeSha,
    tree,
  });
  const commit = kudosGithubApi_('post', '/git/commits', {
    message: 'data: publish ' + snapshot.sources.length +
      ' approved activities with GPX routes',
    tree: newTree.sha,
    parents: [commitSha],
  });
  kudosGithubApi_('patch', '/git/refs/heads/main', {
    sha: commit.sha,
    force: false,
  });

  // Clear checkpoints only AFTER the main ref has successfully advanced.
  for (let i = 0; i < state.chunks; i++) {
    properties.deleteProperty(kudosPublishChunkKey_(i));
  }
  properties.deleteProperty(KUDOS_PUBLISH_STATE_KEY);
  return {
    processed: snapshot.sources.length,
    total: snapshot.sources.length,
    published: true,
    chunks: state.chunks,
    commit: commit.sha,
  };
}

/**
 * Called by publishApprovedPublicPreview() once per manual execution.
 * Each call processes at most 8 files or about 3 minutes of GPX work.
 */
function kudosPublishNextBatch_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('A publish or sync is already in progress; try again later.');
  }
  const started = Date.now();
  try {
    const properties = PropertiesService.getScriptProperties();
    const snapshot = kudosPublishSources_();
    let state = kudosReadPublishState_(properties);
    if (state && state.fingerprint !== snapshot.fingerprint) {
      throw new Error('Users, activities or settings changed during publishing. ' +
        'Call resetPublicPreviewBatch() and start again.');
    }
    if (!state) {
      state = {
        jobId: Utilities.getUuid().replace(/-/g, '').toLowerCase(),
        fingerprint: snapshot.fingerprint,
        next: 0,
        chunks: 0,
      };
      kudosWritePublishState_(properties, state);
    }
    if (state.next > snapshot.sources.length) {
      throw new Error('Publish cursor is beyond available activities; reset.');
    }

    if (state.next < snapshot.sources.length) {
      // Check the budget BETWEEN source GPX files. Do not upload incomplete
      // chunks or advance checkpoints if a source cannot be parsed.
      const routes = [];
      let index = state.next;
      while (index < snapshot.sources.length &&
             routes.length < KUDOS_PUBLISH_BATCH_SIZE) {
        if (routes.length > 0 &&
            Date.now() - started >= KUDOS_PUBLISH_RUNTIME_BUDGET_MS) {
          break;
        }
        const source = snapshot.sources[index];
        try {
          routes.push(kudosPublishedRoute_(source));
        } catch (error) {
          throw new Error('Unable to export run_id ' + source.run_id +
            ' (progress retained): ' + String(error));
        }
        index++;
      }

      const blob = kudosGithubApi_('post', '/git/blobs', {
        content: JSON.stringify({ schema_version: 1, routes }),
        encoding: 'utf-8',
      });
      if (!/^[0-9a-f]{40}$/.test(blob.sha || '')) {
        throw new Error('Invalid route blob SHA from GitHub.');
      }
      // Commit the blob checkpoint BEFORE moving the file cursor.
      properties.setProperty(kudosPublishChunkKey_(state.chunks), blob.sha);
      state.next = index;
      state.chunks += 1;
      kudosWritePublishState_(properties, state);
      Logger.log('Kudos publish staged ' + state.next + '/' +
        snapshot.sources.length + ' activities (' + state.chunks + ' chunks).');
    }

    if (state.next === snapshot.sources.length) {
      const complete = kudosFinalizePublicPreview_(snapshot, state, properties);
      Logger.log('Kudos public preview committed: ' + complete.commit);
      return complete;
    }
    return {
      processed: state.next,
      total: snapshot.sources.length,
      published: false,
      chunks: state.chunks,
    };
  } finally {
    lock.releaseLock();
  }
}

function showPublicPreviewProgress() {
  const snapshot = kudosPublishSources_();
  const state = kudosReadPublishState_(
    PropertiesService.getScriptProperties()
  );
  const status = {
    processed: state ? state.next : 0,
    total: snapshot.sources.length,
    chunks: state ? state.chunks : 0,
    in_progress: Boolean(state),
    needs_reset: Boolean(state && state.fingerprint !== snapshot.fingerprint),
  };
  Logger.log(JSON.stringify(status));
  return status;
}

/**
 * Discard the in-progress local checkpoint. It does NOT modify the currently
 * published site. The unreferenced Git blobs from a failed run can expire.
 */
function resetPublicPreviewBatch() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Publisher is busy.');
  try {
    const properties = PropertiesService.getScriptProperties();
    const state = kudosReadPublishState_(properties);
    if (state) {
      for (let i = 0; i < state.chunks; i++) {
        properties.deleteProperty(kudosPublishChunkKey_(i));
      }
    }
    properties.deleteProperty(KUDOS_PUBLISH_STATE_KEY);
    Logger.log('Kudos publish checkpoint reset; current public data unchanged.');
  } finally {
    lock.releaseLock();
  }
}
