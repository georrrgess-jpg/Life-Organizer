// Builds a single self-contained page (inline CSS + bundled JS) for hosted previews.
// Needs network once for `npx esbuild`; the app itself has no build step.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const js = execFileSync('npx', ['-y', 'esbuild@0.24.2', 'js/app.js', '--bundle', '--format=iife', '--minify', '--target=es2020'], { encoding: 'utf8' });
const css = readFileSync('css/styles.css', 'utf8');
const html = `<title>Evenday</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#f6f6f3">
<style>${css}</style>
<div id="app"></div>
<div id="toasts" class="toasts" aria-live="polite" popover="manual"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/evenday.html', html);
console.log(`dist/evenday.html (${(html.length / 1024).toFixed(1)} KB)`);
