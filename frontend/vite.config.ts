import path from 'path';
import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import eslintPlugin from 'vite-plugin-eslint2';
import stylelintPlugin from 'vite-plugin-stylelint';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = env.PORT || 8001;

  return {
    base: '/',
    build: {
      target: 'es2015',
      outDir: 'public',
      emptyOutDir: true,
      manifest: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          entryFileNames: 'app.[hash].js',
          chunkFileNames: 'app.[hash].chunk.js',
          assetFileNames: 'assets.[hash].[ext]',
        },
      },
    },
    mode: env.NODE_ENV,
    server: {
      host: '0.0.0.0',
      port: port as number,
    },
    define: {
      API_URL: JSON.stringify(env.API_URL),
      APP_URL: JSON.stringify(env.APP_URL),
      NODE_ENV: JSON.stringify(env.NODE_ENV),
      PORT: JSON.stringify(env.PORT),
    },
    resolve: {
      alias: {
        components: path.resolve(__dirname, 'src/components'),
        containers: path.resolve(__dirname, 'src/containers'),
        config: path.resolve(__dirname, 'src/config'),
        api: path.resolve(__dirname, 'src/api'),
        types: path.resolve(__dirname, 'src/types'),
        styles: path.resolve(__dirname, 'src/styles'),
        modals: path.resolve(__dirname, 'src/modals'),
        enums: path.resolve(__dirname, 'src/enums'),
      },
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
    },
    plugins: [
      react(),
      tailwindcss(),
      eslintPlugin(),
      stylelintPlugin(),
    ],
  };
});
