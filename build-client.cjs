// Bundles client/src/main.jsx -> public/app.js + public/app.css (React + JSX, no other tooling).
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function load(name, fallbacks) {
  try { return require(name); } catch { /* try fallbacks */ }
  for (const f of fallbacks) { try { return require(f); } catch { /* next */ } }
  throw new Error(`Cannot find ${name}. Run: npm i -D esbuild react react-dom`);
}
const esbuild = load('esbuild', ['/opt/npm-tools/node_modules/esbuild']);

// Local node_modules wins; falls back to globally installed react (used in this sandbox).
const nodePaths = [path.join(root, 'node_modules'), '/home/claude/.npm-global/lib/node_modules'].filter((p) => fs.existsSync(p));

esbuild.build({
  entryPoints: [path.join(root, 'client/src/main.jsx')],
  bundle: true, minify: true, sourcemap: false, target: ['es2019'],
  jsx: 'automatic', loader: { '.js': 'jsx' }, nodePaths,
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: path.join(root, 'public'), entryNames: 'app', logLevel: 'info',
}).then(() => {
  fs.copyFileSync(path.join(root, 'client/index.html'), path.join(root, 'public/index.html'));
  console.log('Built public/');
}).catch(() => process.exit(1));
