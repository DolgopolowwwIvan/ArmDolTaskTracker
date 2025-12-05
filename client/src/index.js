// src/index.js - исправьте пути
import { socketManager } from './js/socket.js';
import { authManager } from './js/auth.js';
import { taskManager } from './js/tasks.js';
import { dragDropManager } from './js/dragdrop.js';
import { uiManager } from './js/ui.js';

// Инициализация приложения
class TaskTrackerApp {
    constructor() {
        this.init();
    }

    init() {
        console.log('🚀 Task Tracker запускается...');
        
        // 1. Подключаемся к WebSocket
        socketManager.connect();
        
        // 2. Восстанавливаем сессию
        authManager.restoreSession();
        
        // 3. Инициализируем интерфейс
        setTimeout(() => {
            dragDropManager.init();
            console.log('✅ Приложение инициализировано');
        }, 100);
    }
}

// Запуск при загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new TaskTrackerApp();
    });
} else {
    window.app = new TaskTrackerApp();
}

// Экспортируем для консоли
window.socketManager = socketManager;
window.authManager = authManager;
window.taskManager = taskManager;