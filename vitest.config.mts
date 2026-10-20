import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig usa jsx: "preserve" (requerido por Next); para las pruebas se transforma aquí
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // 'server-only' lanza un error fuera de React Server Components
    alias: { 'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)) },
  },
});
