import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    port: '8080',
    open: 'controller.html', // Default to controller for dual-window mode
  },
  publicDir: 'static',
  plugins: [glsl()],
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version), //eslint-disable-line
    'import.meta.env.VITE_BRANCH': JSON.stringify(process.env.BRANCH_NAME || undefined), //eslint-disable-line
  },
  build: {
    rollupOptions: {
      input: {
        controller: resolve(__dirname, 'controller.html'),
        projector: resolve(__dirname, 'projector.html'),
        main: resolve(__dirname, 'index.html'), // Keep for backwards compatibility
      },
    },
  },
});
