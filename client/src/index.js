// src/index.js - исправьте пути
import { socketManager } from './js/socket.js';
import { authManager } from './js/auth.js';
import { taskManager } from './js/tasks.js';
import { dragDropManager } from './js/dragdrop.js';
import { uiManager } from './js/ui.js';
import { debugSocketEvents } from './js/debug.js';

// Инициализация приложения
class TaskTrackerApp {
    constructor() {
        this.init();
    }

    async init() {
        console.log('🚀 Task Tracker запускается...');
        
        // 1. Подключаемся к WebSocket
        socketManager.connect();
        
        // 2. Ждем подключения WebSocket перед восстановлением сессии
        socketManager.on('connected', () => {
            console.log('🔌 WebSocket подключен, восстанавливаем сессию...');
            // 3. Восстанавливаем сессию
            authManager.restoreSession();
        });
        
        // 4. Инициализируем интерфейс
        setTimeout(() => {
            dragDropManager.init();
            console.log('✅ Приложение инициализировано');
            
            // Включаем отладку
            this.enableDebugMode();
        }, 500);
    }
    
    enableDebugMode() {
        // Добавляем глобальные объекты для отладки
        window.debug = {
            socket: socketManager.socket,
            tasks: () => console.log('Все задачи:', taskManager.getAllTasks()),
            user: () => console.log('Текущий пользователь:', authManager.getCurrentUser()),
            connection: () => console.log('WebSocket подключен:', socketManager.isConnected()),
            emitTest: (event, data) => {
                console.log(`Тест события ${event}:`, data);
                socketManager.emit(event, data, (res) => console.log('Ответ:', res));
            }
        };
        
        console.log('🔍 Отладка включена. Используйте window.debug в консоли');
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
window.uiManager = uiManager;
window.dragDropManager = dragDropManager;