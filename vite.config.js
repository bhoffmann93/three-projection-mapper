import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: {
    port: '8080',
    open: 'examples/multi-window/controller.html', // Default to controller for dual-window mode
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
        'single-window': resolve(__dirname, 'examples/single-window/index.html'),
        'multi-window-controller': resolve(__dirname, 'examples/multi-window/controller.html'),
        'multi-window-projector': resolve(__dirname, 'examples/multi-window/projector.html'),
      },
    },
  },
});
