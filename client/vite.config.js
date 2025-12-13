import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: process.cwd(),
    
    // ИСПРАВЛЕНО: Для продакшена используем base и правильные настройки
    base: process.env.NODE_ENV === 'production' ? '/' : './',
    
    server: {
        port: 5173,
        host: true,
        open: false, // Закрываем автоматическое открытие браузера на сервере
        
        // Прокси только для разработки
        proxy: process.env.NODE_ENV === 'development' ? {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true
            }
        } : undefined
    },
    
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html')
            }
        },
        // Оптимизация для продакшена
        minify: 'terser',
        sourcemap: false
    },
    
    // Для продакшена убираем подробные логи
    logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'info'
});