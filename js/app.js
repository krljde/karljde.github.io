/* ─────────────────────────────────────────
   CONFIG
───────────────────────────────────────── */
const FILE_NOW      = 'data/now.json';
const FILE_PROJECTS = 'data/projects.json';
const FILE_NOTES    = 'data/notes.json';
const INLINE_MAP = {
  [FILE_NOW]: 'data-now',
  [FILE_PROJECTS]: 'data-projects'
};
const ROUTES = new Set(['home', 'cv', 'projects', 'notes', 'now', 'services']);

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
async function readJsonFile(path) {
  const inlineId = INLINE_MAP[path];
  if (inlineId) {
    const el = document.getElementById(inlineId);
    if (el && el.textContent.trim()) {
      try { return JSON.parse(el.textContent); } catch {}
    }
  }

  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error('fetch failed');
    return await res.json();
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────
   ROUTING
───────────────────────────────────────── */
function routeFromLocation() {
  const pathRoute = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (ROUTES.has(pathRoute)) return pathRoute;

  const hashRoute = window.location.hash.replace(/^#\/?/, '');
  if (ROUTES.has(hashRoute)) return hashRoute;

  return 'home';
}

function routePath(page) {
  return page === 'home' ? '/' : `/${page}`;
}

function go(page, options = {}) {
  if (!ROUTES.has(page)) page = 'home';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
  }

  if (page === 'now')      renderNow();
  if (page === 'projects') renderProjects();
  if (page === 'notes')    renderNotes();

  if (options.updateHistory !== false && window.location.pathname !== routePath(page)) {
    history.pushState({ page }, '', routePath(page));
  }
}

/* ─────────────────────────────────────────
   RENDER — NOW
───────────────────────────────────────── */
async function renderNow() {
  const el = document.getElementById('now-list');
  el.innerHTML = '<div class="loading">Loading…</div>';

  try {
    const data = await readJsonFile(FILE_NOW);
    if (!data.length) {
      el.innerHTML = '<p class="empty-state">Nothing here yet.</p>';
      return;
    }

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
    const data = await readJsonFile(FILE_PROJECTS);
    if (!data.length) {
      el.innerHTML = '<p class="empty-state">Projects coming soon.</p>';
      return;
    }

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

/* ─────────────────────────────────────────
   RENDER — NOTES
───────────────────────────────────────── */
let expandedNoteSlug = null;

async function renderNotes() {
  const el = document.getElementById('notes-list');
  el.innerHTML = '<div class="loading">Loading…</div>';

  try {
    const data = await readJsonFile(FILE_NOTES);
    if (!data.length) {
      el.innerHTML = '<p class="empty-state">No notes yet.</p>';
      return;
    }

    el.innerHTML = data.map(n => {
      const isOpen   = n.slug === expandedNoteSlug;
      const coverImg = n.cover ? `<img class="note-cover" src="${esc(n.cover)}" alt="" loading="lazy"/>` : '';
      const tagsHtml = (n.tags || []).map(t => `<span class="project-tag">${esc(t)}</span>`).join('');

      return `<div class="note-card ${isOpen ? 'open' : ''}" onclick="toggleNote('${esc(n.slug)}')">
        ${coverImg}
        <div class="note-date">${esc(n.date)}</div>
        <div class="note-title">${esc(n.title)}</div>
        <p class="note-excerpt">${esc(n.excerpt || '')}</p>
        <div class="note-tags">${tagsHtml}</div>
        ${isOpen ? `<div class="note-body" onclick="event.stopPropagation()">${n.html}</div>` : ''}
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="empty-state">Couldn\'t load notes.</p>';
  }
}

function toggleNote(slug) {
  expandedNoteSlug = (expandedNoteSlug === slug) ? null : slug;
  renderNotes();

  if (expandedNoteSlug) {
    requestAnimationFrame(() => {
      const open = document.querySelector('.note-card.open');
      if (open) open.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function renderMediaTag(mediaPath, cssClass) {
  if (/\.(mp4|webm|mov|ogg)$/i.test(mediaPath)) {
    return `<video class="${cssClass} now-media-video" src="${esc(mediaPath)}" controls playsinline muted></video>`;
  }

  const webp = mediaPath.replace(/\.(jpe?g|png|tiff?|avif)$/i, '.webp');
  if (webp === mediaPath) {
    return `<img class="${cssClass}" src="${esc(mediaPath)}" alt="" loading="lazy" decoding="async">`;
  }

  return `<picture>
    <source srcset="${esc(webp)}" type="image/webp">
    <img class="${cssClass}" src="${esc(mediaPath)}" alt="" loading="lazy" decoding="async">
  </picture>`;
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  go(routeFromLocation(), { updateHistory: false });

  const peace = document.querySelector('.peace-once');
  if (!peace) return;
  setTimeout(() => peace.classList.add('animate'), 300);
});

window.addEventListener('popstate', () => {
  go(routeFromLocation(), { updateHistory: false });
});
