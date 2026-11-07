import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API only accepts browser calls from http://localhost:3000, so the port is fixed.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true, host: 'localhost' },
  preview: { port: 3000, strictPort: true, host: 'localhost' },
});
