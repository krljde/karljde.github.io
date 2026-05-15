// Fallback for non-Cloudflare hosting; Cloudflare Pages handles routes via _redirects.
sessionStorage.setItem('spa-redirect', window.location.href);
window.location.replace('/');
