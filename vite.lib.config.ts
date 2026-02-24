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
      entry: {
        lib: resolve(__dirname, 'src/lib.ts'),
        'addons/index': resolve(__dirname, 'src/addons/index.ts'),
      },
      formats: ['es'],
      fileName: (_format: string, entryName: string) => `${entryName}.js`,
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
