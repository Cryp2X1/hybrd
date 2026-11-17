import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
// GitHub Pages SPA support: 404.html fallback for dynamic URLs, plus real index.html copies for the
// main routes so deep links and home-screen launches return HTTP 200.
const ROUTES = ['train', 'train/log', 'train/ultra', 'train/ultra/setup', 'record', 'routes', 'timers', 'fuel', 'fuel/add', 'fuel/calculator', 'fuel/weight-loss', 'fuel/weight-loss/setup', 'fuel/fasting', 'fuel/fasting/setup', 'fuel/sleep', 'fuel/sleep/setup', 'mind', 'mind/setup', 'mind/help', 'progress', 'burn', 'score', 'coach', 'coach/start',
  'social', 'social/new', 'social/post', 'social/friends', 'social/notifications', 'social/saved', 'social/profile', 'social/setup', 'social/rules', 'invite',
  'me', 'me/gallery', 'me/account', 'me/data', 'me/help', 'me/devices', 'me/import', 'sign-in', 'sign-up', 'forgot', 'reset-password'];
copyFileSync('dist/index.html', 'dist/404.html');
for (const r of ROUTES) { mkdirSync(`dist/${r}`, { recursive: true }); copyFileSync('dist/index.html', `dist/${r}/index.html`); }
writeFileSync('dist/.nojekyll', '');
console.log(`postbuild: 404.html, ${ROUTES.length} route copies, .nojekyll`);
