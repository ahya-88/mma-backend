const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const JSX_PATH = path.join(__dirname, 'pesantren-app.jsx');
const OUT_PATH = path.join(__dirname, 'test-render-out.js');

esbuild.buildSync({
  entryPoints: [JSX_PATH],
  bundle: true,
  format: 'cjs',
  outfile: OUT_PATH,
  jsx: 'automatic',
  external: ['react', 'react-dom', 'html2canvas', 'jspdf', 'qrcode', 'lucide-react', 'recharts']
});

const React = require('react');
const ReactDOMServer = require('react-dom/server');

global.React = React; // Provide React globally

const m = require('module');
const originalRequire = m.prototype.require;
m.prototype.require = function (id) {
  if (id === 'lucide-react') {
    return new Proxy({}, {
      get: (target, prop) => (props) => React.createElement('svg', { 'data-lucide': prop, ...props })
    });
  }
  if (id === 'recharts') {
    return new Proxy({}, {
      get: (target, prop) => (props) => React.createElement('div', { 'data-recharts': prop, ...props })
    });
  }
  if (['html2canvas', 'jspdf', 'qrcode'].includes(id)) {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

const App = require('./test-render-out.js').default;

try {
  const html = ReactDOMServer.renderToString(React.createElement(App));
  console.log('RENDER SUCCESS, length:', html.length);
} catch (e) {
  console.log('RENDER ERROR:');
  console.error(e);
}
