import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: 'http://127.0.0.1:8000', rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, '') } };

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true, proxy },
  preview: { port: 3000, strictPort: true, proxy },
});
