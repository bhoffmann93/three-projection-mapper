import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import dts from 'vite-plugin-dts';
//@ts-ignore
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    glsl(),
    dts({
      tsconfigPath: './tsconfig.lib.json',
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      //@ts-ignore
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
