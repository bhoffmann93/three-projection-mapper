import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: '8080',
    open: 'index.html',
  },
  publicDir: 'static',
  plugins: [glsl()],
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version), //eslint-disable-line
    'import.meta.env.VITE_BRANCH': JSON.stringify(process.env.BRANCH_NAME || undefined), //eslint-disable-line
  },
});
