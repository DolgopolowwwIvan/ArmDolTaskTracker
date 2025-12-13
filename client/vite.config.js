import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: process.cwd(),
    
    // Указываем явно корневую директорию
    base: './',
    
    server: {
        port: 5173,
        host: true,
        open: false,
    },
    
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        // Явно указываем входную точку
        rollupOptions: {
            input: path.resolve(__dirname, 'index.html'),
            output: {
                // Это важно для правильных путей
                assetFileNames: 'assets/[name][extname]',
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: 'assets/[name]-[hash].js'
            }
        },
        minify: 'terser',
        sourcemap: false
    }
});