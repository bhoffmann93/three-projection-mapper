import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';

export default defineConfig({
  plugins: [glsl()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib.ts'),
      name: 'ThreeProjectionMapping',
      fileName: 'lib',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['three'],
      output: {
        globals: {
          three: 'THREE',
        },
      },
    },
  },
});
