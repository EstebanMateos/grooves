import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    base: isProd ? '/grooves/' : '/',
    server: {hmr: {path: '/'}}
  };
});
