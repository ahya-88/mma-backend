const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const JSX_PATH = path.join(ROOT_DIR, 'pesantren-app.jsx');
const PUBLIC_INDEX_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const DIST_HTML_PATH = path.join(ROOT_DIR, 'pesantren-app.html');
const ENTRY_SCRATCH_PATH = path.join(ROOT_DIR, 'scratch_entry.jsx');

console.log('Building MMA Application...');

const entryCode = `
import App from "./pesantren-app.jsx";
const rootEl = document.getElementById("root");
if (rootEl && window.ReactDOM) {
  window.ReactDOM.createRoot(rootEl).render(window.React.createElement(App));
}
`;
fs.writeFileSync(ENTRY_SCRATCH_PATH, entryCode, 'utf8');

try {
  const result = esbuild.buildSync({
    entryPoints: [ENTRY_SCRATCH_PATH],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020'],
    jsx: 'transform',
    jsxFactory: 'window.React.createElement',
    jsxFragment: 'window.React.Fragment',
    external: ['core-js/*', 'canvg'],
    write: false,
  });

  const bundledJs = result.outputFiles[0].text;
  console.log(`Bundled JS size: ${(bundledJs.length / 1024).toFixed(1)} KB`);

  const currentHtml = fs.readFileSync(PUBLIC_INDEX_PATH, 'utf8');
  const rootDivIndex = currentHtml.indexOf('<div id="root"></div>');
  const scriptStart = currentHtml.indexOf('<script>', rootDivIndex);
  const scriptEnd = currentHtml.indexOf('</script>', scriptStart);

  let finalHtml = currentHtml.slice(0, scriptStart + '<script>\n'.length) +
    bundledJs +
    '\n' +
    currentHtml.slice(scriptEnd);

  const lastClosing = finalHtml.lastIndexOf('</body></html>');
  if (!finalHtml.includes('/offline-cashier.js') && lastClosing !== -1) {
    finalHtml = finalHtml.slice(0, lastClosing) + '<script src="/offline-cashier.js"></script>\n</body></html>';
  }

  fs.writeFileSync(PUBLIC_INDEX_PATH, finalHtml, 'utf8');
  fs.writeFileSync(DIST_HTML_PATH, finalHtml, 'utf8');

  const downloadsFolder = 'C:\\Users\\Mudaiyatul Anwar\\Downloads';
  try {
    if (fs.existsSync(downloadsFolder)) {
      fs.copyFileSync(JSX_PATH, path.join(downloadsFolder, 'pesantren-app.jsx'));
      fs.copyFileSync(DIST_HTML_PATH, path.join(downloadsFolder, 'pesantren-app.html'));
      console.log('Synced to Downloads/pesantren-app.jsx and pesantren-app.html');
    }
  } catch (e) {
    console.warn('Could not sync to Downloads folder:', e.message);
  }

  console.log('Build completed successfully!');
} finally {
  if (fs.existsSync(ENTRY_SCRATCH_PATH)) {
    fs.unlinkSync(ENTRY_SCRATCH_PATH);
  }
}
