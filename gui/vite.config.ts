/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 4000 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./vitest.setup.ts'], include: ['src/**/*.test.{ts,tsx}'] },
});