import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, resolve(import.meta.dirname, '..'), '');
  const desktopEnv = loadEnv(mode, import.meta.dirname, '');
  const value = (desktopKey: string, rootKey: string, fallback = '') => desktopEnv[desktopKey] || rootEnv[rootKey] || fallback;
  const define = {
    __GP_SUPABASE_URL__: JSON.stringify(value('VITE_GP_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')),
    __GP_SUPABASE_ANON_KEY__: JSON.stringify(value('VITE_GP_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY')),
    __GP_API_URL__: JSON.stringify(value('VITE_GP_API_URL', 'APP_URL', 'https://gorillapunch.run')),
  };
  return {
    main: { define, build: { externalizeDeps: true, sourcemap: false, outDir: 'out/main', rollupOptions: { input: { index: resolve(import.meta.dirname, 'electron/main.ts') } } } },
    preload: { build: { externalizeDeps: true, sourcemap: false, outDir: 'out/preload', rollupOptions: { input: { index: resolve(import.meta.dirname, 'electron/preload.ts') }, output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
    renderer: {
      root: '.',
      plugins: [react()],
      build: { outDir: 'out/renderer', sourcemap: false, rollupOptions: { input: resolve(import.meta.dirname, 'index.html') } },
      server: { host: '127.0.0.1' },
    },
  };
});
