import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
// GitHub Pages SPA support: 404.html fallback for dynamic URLs, plus real index.html copies for the
// main routes so deep links and home-screen launches return HTTP 200.
const ROUTES = ['train', 'train/log', 'record', 'routes', 'timers', 'fuel', 'fuel/add', 'fuel/calculator', 'progress', 'score',
  'me', 'me/account', 'me/data', 'me/help', 'sign-in', 'sign-up', 'forgot', 'reset-password'];
copyFileSync('dist/index.html', 'dist/404.html');
for (const r of ROUTES) { mkdirSync(`dist/${r}`, { recursive: true }); copyFileSync('dist/index.html', `dist/${r}/index.html`); }
writeFileSync('dist/.nojekyll', '');
console.log(`postbuild: 404.html, ${ROUTES.length} route copies, .nojekyll`);
