# karljde.com

This is my personal site - a lightweight space for my work, projects, notes, and current focus.

## Structure

- `index.html` - static site shell and route containers
- `js/app.js` - client-side routing and rendering
- `data/now.json` - generated entries for `/now`
- `data/projects.json` - generated project listings
- `data/notes.json` - generated published notes
- `media/` - images and videos used by the site

## How it works

Content is written in my Obsidian vault, then published through a small Node pipeline:

```text
Obsidian vault -> .publish/publish.js -> generated JSON/media -> site repo -> Cloudflare Pages
```

The publisher scans selected vault folders, converts publishable notes to HTML, copies media, updates the generated JSON files, inlines small data sets into `index.html`, and refreshes SEO assets such as the sitemap.

## Stack

- HTML, CSS, vanilla JavaScript
- Obsidian-backed publishing pipeline
- GitHub Actions
- Cloudflare Pages

## Notes

The goal is still the same: keep the site fast, legible, and easy to own. The difference is that content now flows outward from the vault instead of being edited through a browser-side admin layer.

If you're curious about how it works or want to build something similar, feel free to reach out.

Email: karljudemagbanlag@gmail.com
