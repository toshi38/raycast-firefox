const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

esbuild.build({
  entryPoints: ['host.js'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: 'dist/host.bundle.js',
  minify: false,        // Keep readable for debugging user issues
  sourcemap: false,     // Single file is already debuggable
  metafile: true,
  banner: {
    js: '// Bundled by esbuild -- do not edit',
  },
}).then(result => {
  // Copy run.sh to dist/ for co-location
  fs.mkdirSync('dist', { recursive: true });
  fs.copyFileSync('run.sh', path.join('dist', 'run.sh'));
  fs.chmodSync(path.join('dist', 'run.sh'), 0o755);

  // Log bundle analysis
  return esbuild.analyzeMetafile(result.metafile);
}).then(analysis => {
  console.log('Bundle analysis:');
  console.log(analysis);
}).catch(() => process.exit(1));
