import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react()],
    base: '/',
    server: {hmr: {path: '/'}}
  };
});
