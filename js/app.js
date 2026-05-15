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
let currentPage = null;
let notesCache = null;

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

async function getNotes() {
  if (notesCache == null) {
    notesCache = await readJsonFile(FILE_NOTES);
  }

  return notesCache;
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

function restoreRedirectedPath() {
  const redirect = sessionStorage.getItem('spa-redirect');
  if (!redirect) return;

  sessionStorage.removeItem('spa-redirect');
  try {
    const url = new URL(redirect, window.location.origin);
    if (url.origin === window.location.origin) {
      history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {}
}

function go(page, options = {}) {
  if (!ROUTES.has(page)) page = 'home';
  if (page === currentPage) return;
  currentPage = page;

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

    el.innerHTML = data.map(e => {
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

    el.innerHTML = data.map(p => {
      const mediaHtml = p.media ? renderMediaTag(p.media, 'project-media') : '';
      const tags = (p.tags || [])
        .map(t => `<span class="project-tag">${esc(t)}</span>`).join('');

      return `<div class="project-card">
        ${mediaHtml}
        <div class="project-title">${p.url
          ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)}↗</a>`
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
  if (notesCache == null) {
    el.innerHTML = '<div class="loading">Loading…</div>';
  }

  try {
    const data = await getNotes();
    if (!data.length) {
      el.innerHTML = '<p class="empty-state">No notes yet.</p>';
      return;
    }

    el.innerHTML = data.map(n => {
      const isOpen   = n.slug === expandedNoteSlug;
      const coverImg = n.cover ? `<img class="note-cover" src="${esc(n.cover)}" alt="" loading="lazy"/>` : '';
      const tagsHtml = (n.tags || []).map(t => `<span class="project-tag">${esc(t)}</span>`).join('');

      return `<article class="note-card ${isOpen ? 'open' : ''}">
        <div class="note-toggle" role="button" tabindex="0" data-note-slug="${esc(n.slug)}" aria-expanded="${isOpen}">
          ${coverImg}
          <div class="note-date">${esc(n.date)}</div>
          <div class="note-title">${esc(n.title)}</div>
          <p class="note-excerpt">${esc(n.excerpt || '')}</p>
          <div class="note-tags">${tagsHtml}</div>
        </div>
        ${isOpen ? `<div class="note-body">${n.html}</div>` : ''}
      </article>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="empty-state">Couldn\'t load notes.</p>';
  }
}

async function toggleNote(slug) {
  expandedNoteSlug = (expandedNoteSlug === slug) ? null : slug;
  await renderNotes();

  if (expandedNoteSlug === slug) {
    requestAnimationFrame(() => {
      const open = document.querySelector('.note-card.open');
      if (open) open.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function renderMediaTag(mediaPath, cssClass) {
  if (/\.(mp4|webm|mov|ogg)$/i.test(mediaPath)) {
    return `<video class="${cssClass} now-media-video" src="${esc(mediaPath)}" controls playsinline muted preload="metadata"></video>`;
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  restoreRedirectedPath();
  go(routeFromLocation(), { updateHistory: false });

  const peace = document.querySelector('.peace-once');
  if (!peace) return;
  setTimeout(() => peace.classList.add('animate'), 300);
});

window.addEventListener('popstate', () => {
  go(routeFromLocation(), { updateHistory: false });
});

document.addEventListener('click', event => {
  const routeLink = event.target.closest('a[data-route]');
  if (
    routeLink &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !routeLink.target
  ) {
    event.preventDefault();
    go(routeLink.dataset.route);
    return;
  }

  const noteToggle = event.target.closest('[data-note-slug]');
  if (noteToggle) {
    void toggleNote(noteToggle.dataset.noteSlug);
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;

  const noteToggle = event.target.closest('[data-note-slug]');
  if (!noteToggle) return;

  event.preventDefault();
  void toggleNote(noteToggle.dataset.noteSlug);
});
