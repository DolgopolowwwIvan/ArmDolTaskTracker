import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Корень проекта
  root: process.cwd(),
  
  server: {
    port: 5173,
    host: true,
    open: true,
    
    // Прокси для WebSocket
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  
  // Важно для разработки
  base: './',
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  
  // Оптимизация сборки
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  
  // Для отладки
  logLevel: 'info'
});