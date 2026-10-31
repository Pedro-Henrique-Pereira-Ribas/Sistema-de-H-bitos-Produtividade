/* Gera os SDKs browser usados pelo app estático: Neon Auth e Neon Realtime. */
import { build } from 'esbuild';

const bundles = [
  { entryPoints: ['client/neon-auth.js'], outfile: 'vendor/neon-auth.js' },
  { entryPoints: ['client/realtime.js'], outfile: 'vendor/neon-realtime.js' }
];

for (const bundle of bundles) {
  await build({
    ...bundle,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    logLevel: 'info'
  });
}
