/* ─────────────────────────────────────────
   CONFIG  —  edit these to match your repo
───────────────────────────────────────── */
const ADMIN_PASSWORD = 'karl2025admin';
const GITHUB_OWNER   = 'krljde';
const GITHUB_REPO    = 'karljde.github.io';
const DEFAULT_BRANCH = 'main';
const FILE_NOW       = 'data/now.json';
const FILE_PROJECTS  = 'data/projects.json';
const API_BASE       = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/`;
const RAW_BASE       = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${DEFAULT_BRANCH}/`;

/* ─────────────────────────────────────────
   STATE
───────────────────────────────────────── */
let adminUnlocked        = false;
let currentPage          = 'home';
let editingNowIndex      = null;
let editingNowMedia      = null;
let editingProjectIndex  = null;
let editingProjectMedia  = null;
const RECENT_WRITE_MS     = 180000;

/* ─────────────────────────────────────────
   TOKEN HELPERS
───────────────────────────────────────── */
function getToken() { return localStorage.getItem('kjm_gh_token') || ''; }

function saveToken() {
  const t = document.getElementById('token-input').value.trim();
  if (!t) return;
  localStorage.setItem('kjm_gh_token', t);
  document.getElementById('token-input').value = '';
  updateTokenStatus();
}

function clearToken() {
  localStorage.removeItem('kjm_gh_token');
  updateTokenStatus();
}

function updateTokenStatus() {
  const hasToken = !!getToken();
  const el    = document.getElementById('token-status');
  const input = document.getElementById('token-input');
  if (el)    el.textContent    = hasToken ? '✓ Token saved.' : 'No token — add one to enable saving.';
  if (input) input.placeholder = hasToken ? 'Token already saved' : 'ghp_…';
}

/* ─────────────────────────────────────────
   GITHUB API HELPERS
───────────────────────────────────────── */
async function ghGet(path) {
  const token = getToken();
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = `token ${token}`;
  const res = await fetch(API_BASE + path + `?ref=${DEFAULT_BRANCH}&t=` + Date.now(), { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub fetch failed: ' + res.status);
  return res.json();
}

async function getFileSha(path) {
  const file = await ghGet(path).catch(() => null);
  return file?.sha || null;
}

async function ghPut(path, content, sha, message) {
  const token = getToken();
  if (!token) throw new Error('No GitHub token. Add it in admin first.');
  const effectiveSha = sha || await getFileSha(path);
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    branch: DEFAULT_BRANCH
  };
  if (effectiveSha) body.sha = effectiveSha;
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${e.message || 'Write failed'}`);
  }
  return res.json();
}

async function ghPutBinary(path, base64data, sha, message) {
  const token = getToken();
  if (!token) throw new Error('No GitHub token.');
  const effectiveSha = sha || await getFileSha(path);
  const body = { message, content: base64data, branch: DEFAULT_BRANCH };
  if (effectiveSha) body.sha = effectiveSha;
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${e.message || 'Upload failed'}`);
  }
  return res.json();
}

/* ─────────────────────────────────────────
   LOCAL CACHE HELPERS
───────────────────────────────────────── */
function getCacheKey(path)       { return `kjm_cache_${path}`; }
function getRecentWriteKey(path) { return `kjm_recent_write_${path}`; }

function saveLocalCache(path, data) {
  try {
    localStorage.setItem(getCacheKey(path), JSON.stringify(data));
    localStorage.setItem(getRecentWriteKey(path), String(Date.now()));
  } catch {}
}

function readLocalCache(path) {
  try {
    const cached = localStorage.getItem(getCacheKey(path));
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

function hasRecentWrite(path, maxAgeMs = 15000) {
  try {
    const ts = Number(localStorage.getItem(getRecentWriteKey(path)) || 0);
    return ts && (Date.now() - ts) < maxAgeMs;
  } catch { return false; }
}

async function readJsonFile(path) {
  const cached = readLocalCache(path);

  // Keep freshly saved data stable for a bit.
  // This prevents a second admin action (like saving a project right after a now entry)
  // from re-fetching an older GitHub snapshot and briefly overwriting the UI.
  if (cached && hasRecentWrite(path, RECENT_WRITE_MS)) {
    return { data: cached, sha: null };
  }

  // When a token is available, prefer the GitHub Contents API for fresher reads.
  // This is especially helpful in admin mode right after writes.
  try {
    const file = await ghGet(path);
    if (file?.content) {
      const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
      const data = JSON.parse(decoded);
      try { localStorage.setItem(getCacheKey(path), JSON.stringify(data)); } catch {}
      return { data, sha: file.sha || null };
    }
  } catch {}

  try {
    const res = await fetch(RAW_BASE + path + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('RAW fetch failed');
    const data = await res.json();
    try { localStorage.setItem(getCacheKey(path), JSON.stringify(data)); } catch {}
    return { data, sha: null };
  } catch {
    if (cached) return { data: cached, sha: null };
    return { data: [], sha: null };
  }
}

/* ─────────────────────────────────────────
   MEDIA UPLOAD
───────────────────────────────────────── */
async function uploadMedia(fileInput, statusId) {
  const file = fileInput.files[0];
  if (!file) return null;
  showStatus(statusId, 'Uploading media…', false);
  const base64   = await fileToBase64(file);
  const ext      = file.name.split('.').pop();
  const filename = `media/${Date.now()}.${ext}`;
  const existing = await ghGet(filename).catch(() => null);
  await ghPutBinary(filename, base64, existing?.sha || null, 'Upload media');
  return filename;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ─────────────────────────────────────────
   ROUTING
───────────────────────────────────────── */
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.add('active');
    currentPage = page;
    window.scrollTo(0, 0);
  }
  if (page === 'now')      renderNow();
  if (page === 'projects') renderProjects();
  if (page === 'admin') {
    updateTokenStatus();
    loadAdminNow();
    loadAdminProjects();
    initBulletFields();
  }
}

/* ─────────────────────────────────────────
   RENDER — NOW
───────────────────────────────────────── */
async function renderNow() {
  const el = document.getElementById('now-list');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { data } = await readJsonFile(FILE_NOW);
    if (!data.length) { el.innerHTML = '<p class="empty-state">Nothing here yet.</p>'; return; }
    el.innerHTML = data.slice().reverse().map(e => {
      const mediaHtml  = e.media ? renderMediaTag(e.media, 'now-media') : '';
      const bullets    = (e.bullets || []).filter(b => b.trim());
      const bulletsHtml = bullets.length
        ? `<ul class="now-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
        : '';
      return `<div class="now-block">
        <div class="now-block-header">${esc(e.heading)}</div>
        ${mediaHtml}${bulletsHtml}
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="empty-state">Couldn\'t load entries.</p>';
  }
}

/* ─────────────────────────────────────────
   RENDER — PROJECTS
───────────────────────────────────────── */
async function renderProjects() {
  const el = document.getElementById('projects-list');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { data } = await readJsonFile(FILE_PROJECTS);
    if (!data.length) { el.innerHTML = '<p class="empty-state">Projects coming soon.</p>'; return; }
    el.innerHTML = data.slice().reverse().map(p => {
      const mediaHtml = p.media ? renderMediaTag(p.media, 'project-media') : '';
      const tags = (p.tags || '').split(',').filter(t => t.trim())
        .map(t => `<span class="project-tag">${esc(t.trim())}</span>`).join('');
      return `<div class="project-card">
        ${mediaHtml}
        <div class="project-title">${p.url
          ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}↗</a>`
          : esc(p.title)
        }</div>
        <p class="project-desc">${esc(p.desc)}</p>
        ${tags}
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="empty-state">Couldn\'t load projects.</p>';
  }
}

function renderMediaTag(mediaPath, cssClass) {
  const url     = RAW_BASE + mediaPath;
  const isVideo = /\.(mp4|webm|mov|ogg)$/i.test(mediaPath);
  return isVideo
    ? `<video class="${cssClass} now-media-video" src="${url}" controls playsinline muted></video>`
    : `<img class="${cssClass}" src="${url}" alt="" loading="lazy"/>`;
}

async function refreshViews() {
  await Promise.allSettled([renderNow(), renderProjects(), loadAdminNow(), loadAdminProjects()]);
}

/* ─────────────────────────────────────────
   ADMIN — NOW ENTRIES
───────────────────────────────────────── */
function getAutoNowHeading() {
  const now      = new Date();
  const datePart = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const tz       = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  let locationPart = 'Local time';
  if (tz.includes('/')) {
    const parts = tz.split('/');
    locationPart = parts[parts.length - 1].replace(/_/g, ' ');
  } else if (tz) {
    locationPart = tz.replace(/_/g, ' ');
  }
  return `${datePart}, ${locationPart}`;
}

async function loadAdminNow() {
  const el = document.getElementById('admin-now-list');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { data } = await readJsonFile(FILE_NOW);
    if (!data.length) { el.innerHTML = '<div class="empty-state">No entries yet.</div>'; return; }
    el.innerHTML = data.slice().reverse().map((e, ri) => {
      const i = data.length - 1 - ri;
      return `<div class="admin-item">
        <div class="admin-item-info">
          <strong>${esc(e.heading)}</strong>
          <span>${(e.bullets || []).length} bullet(s)${e.media ? ' · has media' : ''}</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn btn-ghost btn-small" onclick="moveNow(${i},-1)" ${i===0?'disabled':''}>↑</button>
          <button class="btn btn-ghost btn-small" onclick="moveNow(${i},1)"  ${i===data.length-1?'disabled':''}>↓</button>
          <button class="btn btn-ghost btn-small" onclick="startNowEdit(${i})">Edit</button>
          <button class="btn btn-danger btn-small" onclick="deleteNow(${i})">Remove</button>
        </div>
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<div class="empty-state">Could not load.</div>';
  }
}

async function startNowEdit(index) {
  try {
    const { data } = await readJsonFile(FILE_NOW);
    const entry = data[index];
    if (!entry) return;
    editingNowIndex = index;
    editingNowMedia = entry.media || null;
    document.getElementById('now-heading').value = entry.heading || '';
    setBullets('now-bullets-input', entry.bullets || []);
    setCurrentMediaNote('now-current-media', editingNowMedia);
    document.getElementById('now-edit-note').style.display = 'block';
    document.getElementById('btn-cancel-now').style.display = 'inline-block';
    setButtonText('btn-add-now', 'Update entry');
    resetMediaInput('now-media-file', 'now-media-preview');
    showStatus('now-status', 'Editing entry…', false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    showStatus('now-status', e.message || 'Could not load entry.', true);
  }
}

function cancelNowEdit() {
  editingNowIndex = null;
  editingNowMedia = null;
  document.getElementById('now-heading').value = '';
  setBullets('now-bullets-input', ['']);
  setCurrentMediaNote('now-current-media', null);
  document.getElementById('now-edit-note').style.display = 'none';
  document.getElementById('btn-cancel-now').style.display = 'none';
  setButtonText('btn-add-now', 'Save to GitHub');
  resetMediaInput('now-media-file', 'now-media-preview');
}

async function addNow() {
  let heading   = document.getElementById('now-heading').value.trim();
  const bullets = getBullets('now-bullets-input');
  if (!bullets.length) return;
  if (!heading) heading = getAutoNowHeading();

  const btn        = document.getElementById('btn-add-now');
  const wasEditing = editingNowIndex !== null;
  btn.disabled     = true;
  btn.textContent  = wasEditing ? 'Updating…' : 'Saving…';

  try {
    let media = editingNowMedia;
    const fi  = document.getElementById('now-media-file');
    if (fi.files[0]) media = await uploadMedia(fi, 'now-status');

    const { data, sha } = await readJsonFile(FILE_NOW);
    const payload = { heading, bullets, media };
    if (wasEditing) data[editingNowIndex] = payload;
    else            data.push(payload);

    await ghPut(FILE_NOW, data, sha, `${wasEditing ? 'Update' : 'Add'} now entry: ${heading}`);
    saveLocalCache(FILE_NOW, data);
    cancelNowEdit();
    showStatus('now-status', wasEditing ? 'Updated ✓' : 'Saved ✓', false);
    await refreshViews();
  } catch (e) { showStatus('now-status', e.message, true); }

  btn.disabled    = false;
  btn.textContent = 'Save to GitHub';
}

async function moveNow(i, direction) {
  try {
    const { data, sha } = await readJsonFile(FILE_NOW);
    const j = i + direction;
    if (j < 0 || j >= data.length) return;
    [data[i], data[j]] = [data[j], data[i]];
    await ghPut(FILE_NOW, data, sha, 'Reorder now entries');
    saveLocalCache(FILE_NOW, data);
    showStatus('now-status', 'Order updated ✓', false);
    await refreshViews();
  } catch (e) { showStatus('now-status', e.message, true); }
}

async function deleteNow(i) {
  if (!confirm('Remove this entry?')) return;
  try {
    const { data, sha } = await readJsonFile(FILE_NOW);
    data.splice(i, 1);
    await ghPut(FILE_NOW, data, sha, 'Remove now entry');
    saveLocalCache(FILE_NOW, data);
    if (editingNowIndex === i) cancelNowEdit();
    else if (editingNowIndex !== null && i < editingNowIndex) editingNowIndex -= 1;
    showStatus('now-status', 'Removed ✓', false);
    await refreshViews();
  } catch (e) { showStatus('now-status', e.message, true); }
}

/* ─────────────────────────────────────────
   ADMIN — PROJECTS
───────────────────────────────────────── */
async function loadAdminProjects() {
  const el = document.getElementById('admin-projects-list');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { data } = await readJsonFile(FILE_PROJECTS);
    if (!data.length) { el.innerHTML = '<div class="empty-state">No projects yet.</div>'; return; }
    el.innerHTML = data.slice().reverse().map((p, ri) => {
      const i = data.length - 1 - ri;
      return `<div class="admin-item">
        <div class="admin-item-info">
          <strong>${esc(p.title)}</strong>
          <span>${esc(p.tags || '')}${p.media ? ' · has media' : ''}</span>
        </div>
        <div class="admin-item-actions">
          <button class="btn btn-ghost btn-small" onclick="moveProject(${i},-1)" ${i===0?'disabled':''}>↑</button>
          <button class="btn btn-ghost btn-small" onclick="moveProject(${i},1)"  ${i===data.length-1?'disabled':''}>↓</button>
          <button class="btn btn-ghost btn-small" onclick="startProjectEdit(${i})">Edit</button>
          <button class="btn btn-danger btn-small" onclick="deleteProject(${i})">Remove</button>
        </div>
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<div class="empty-state">Could not load.</div>';
  }
}

async function startProjectEdit(index) {
  try {
    const { data } = await readJsonFile(FILE_PROJECTS);
    const project  = data[index];
    if (!project) return;
    editingProjectIndex = index;
    editingProjectMedia = project.media || null;
    document.getElementById('proj-title').value = project.title || '';
    document.getElementById('proj-desc').value  = project.desc  || '';
    document.getElementById('proj-url').value   = project.url   || '';
    document.getElementById('proj-tags').value  = project.tags  || '';
    setCurrentMediaNote('proj-current-media', editingProjectMedia);
    document.getElementById('proj-edit-note').style.display   = 'block';
    document.getElementById('btn-cancel-proj').style.display  = 'inline-block';
    setButtonText('btn-add-proj', 'Update project');
    resetMediaInput('proj-media-file', 'proj-media-preview');
    showStatus('proj-status', 'Editing project…', false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    showStatus('proj-status', e.message || 'Could not load project.', true);
  }
}

function cancelProjectEdit() {
  editingProjectIndex = null;
  editingProjectMedia = null;
  ['proj-title','proj-desc','proj-url','proj-tags'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  setCurrentMediaNote('proj-current-media', null);
  document.getElementById('proj-edit-note').style.display  = 'none';
  document.getElementById('btn-cancel-proj').style.display = 'none';
  setButtonText('btn-add-proj', 'Save to GitHub');
  resetMediaInput('proj-media-file', 'proj-media-preview');
}

async function addProject() {
  const title = document.getElementById('proj-title').value.trim();
  const desc  = document.getElementById('proj-desc').value.trim();
  const url   = document.getElementById('proj-url').value.trim();
  const tags  = document.getElementById('proj-tags').value.trim();
  if (!title) return;

  const btn        = document.getElementById('btn-add-proj');
  const wasEditing = editingProjectIndex !== null;
  btn.disabled     = true;
  btn.textContent  = wasEditing ? 'Updating…' : 'Saving…';

  try {
    let media = editingProjectMedia;
    const fi  = document.getElementById('proj-media-file');
    if (fi.files[0]) media = await uploadMedia(fi, 'proj-status');

    const { data, sha } = await readJsonFile(FILE_PROJECTS);
    const payload = { title, desc, url, tags, media };
    if (wasEditing) data[editingProjectIndex] = payload;
    else            data.push(payload);

    await ghPut(FILE_PROJECTS, data, sha, `${wasEditing ? 'Update' : 'Add'} project: ${title}`);
    saveLocalCache(FILE_PROJECTS, data);
    cancelProjectEdit();
    showStatus('proj-status', wasEditing ? 'Updated ✓' : 'Saved ✓', false);
    await refreshViews();
  } catch (e) { showStatus('proj-status', e.message, true); }

  btn.disabled    = false;
  btn.textContent = 'Save to GitHub';
}

async function moveProject(i, direction) {
  try {
    const { data, sha } = await readJsonFile(FILE_PROJECTS);
    const j = i + direction;
    if (j < 0 || j >= data.length) return;
    [data[i], data[j]] = [data[j], data[i]];
    await ghPut(FILE_PROJECTS, data, sha, 'Reorder projects');
    saveLocalCache(FILE_PROJECTS, data);
    showStatus('proj-status', 'Order updated ✓', false);
    await refreshViews();
  } catch (e) { showStatus('proj-status', e.message, true); }
}

async function deleteProject(i) {
  if (!confirm('Remove this project?')) return;
  try {
    const { data, sha } = await readJsonFile(FILE_PROJECTS);
    data.splice(i, 1);
    await ghPut(FILE_PROJECTS, data, sha, 'Remove project');
    saveLocalCache(FILE_PROJECTS, data);
    if (editingProjectIndex === i) cancelProjectEdit();
    else if (editingProjectIndex !== null && i < editingProjectIndex) editingProjectIndex -= 1;
    showStatus('proj-status', 'Removed ✓', false);
    await refreshViews();
  } catch (e) { showStatus('proj-status', e.message, true); }
}

/* ─────────────────────────────────────────
   UI HELPERS
───────────────────────────────────────── */
function setButtonText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setCurrentMediaNote(id, mediaPath) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!mediaPath) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.textContent   = `Current media: ${mediaPath.split('/').pop()}`;
}

function resetMediaInput(inputId, previewId) {
  const input   = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (input)   input.value          = '';
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
}

function setBullets(containerId, bullets = []) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  const items = bullets.length ? bullets : [''];
  items.forEach(text => addBulletField(containerId, text));
}

function initBulletFields() {
  const c = document.getElementById('now-bullets-input');
  if (c && !c.children.length) addBulletField('now-bullets-input');
}

function addBulletField(containerId, value = '') {
  const c   = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'bullet-row';
  row.innerHTML = `<textarea placeholder="What's going on…" rows="2"></textarea>
    <button class="rm-btn" onclick="this.parentElement.remove()">×</button>`;
  c.appendChild(row);
  row.querySelector('textarea').value = value;
}

function getBullets(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} textarea`))
    .map(t => t.value.trim()).filter(Boolean);
}

function previewMedia(input, previewId) {
  const preview = document.getElementById(previewId);
  const file    = input.files[0];
  if (!file || !file.type.startsWith('image/')) {
    preview.style.display = 'none';
    preview.src = '';
    return;
  }
  const reader  = new FileReader();
  reader.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
  reader.readAsDataURL(file);
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showStatus(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = 'status-msg ' + (isErr ? 'err' : 'ok');
  setTimeout(() => { el.className = 'status-msg'; }, 5000);
}

/* ─────────────────────────────────────────
   ADMIN LOCK / LOGIN
───────────────────────────────────────── */
let lockClicks = 0, lockTimer;

function clickLock() {
  if (adminUnlocked) {
    adminUnlocked = false;
    document.getElementById('admin-lock').classList.remove('active');
    if (currentPage === 'admin') go('home');
    return;
  }
  lockClicks++;
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => { lockClicks = 0; }, 1500);
  if (lockClicks >= 3) {
    lockClicks = 0;
    document.getElementById('admin-login').classList.add('open');
    setTimeout(() => document.getElementById('admin-pass').focus(), 80);
  }
}

function tryLogin() {
  if (document.getElementById('admin-pass').value === ADMIN_PASSWORD) {
    adminUnlocked = true;
    document.getElementById('admin-login').classList.remove('open');
    document.getElementById('admin-lock').classList.add('active');
    document.getElementById('admin-pass').value = '';
    document.getElementById('login-error').style.display = 'none';
    go('admin');
  } else {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('admin-pass').value = '';
  }
}

function closeLogin() {
  document.getElementById('admin-login').classList.remove('open');
  document.getElementById('admin-pass').value = '';
  document.getElementById('login-error').style.display = 'none';
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
updateTokenStatus();
initBulletFields();
renderNow().catch(() => {});
renderProjects().catch(() => {});

window.addEventListener('DOMContentLoaded', () => {
  const peace = document.querySelector('.peace-once');
  if (!peace) return;
  setTimeout(() => peace.classList.add('animate'), 300);
});
