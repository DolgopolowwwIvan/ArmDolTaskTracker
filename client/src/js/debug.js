// src/js/debug.js
export function debugSocketEvents() {
    console.log('🔍 Включение отладки WebSocket событий...');
    
    const events = [
        'connect',
        'disconnect', 
        'task:create',
        'task:update',
        'task:delete',
        'task:complete',
        'task:share',
        'user:authenticated',
        'user:login',
        'user:register',
        'error',
        'sync:update',
        'profile:view'
    ];
    
    events.forEach(event => {
        socketManager.socket.on(event, (data) => {
            console.log(`🎯 [${event}]`, data);
        });
    });
    
    // Логируем все события
    socketManager.socket.onAny((eventName, ...args) => {
        console.log(`📥 Все события [${eventName}]`, args);
    });
    
    console.log('✅ WebSocket отладка включена');
}

// Тестовые функции
export function testCreateTask() {
    const taskData = {
        title: 'Тестовая задача ' + Date.now(),
        description: 'Создана для тестирования'
    };
    
    socketManager.emit('task:create', taskData, (response) => {
        console.log('Тест создания задачи:', response);
    });
}

export function testCompleteTask(taskId) {
    socketManager.emit('task:complete', { taskId: Number(taskId) }, (response) => {
        console.log('Тест выполнения задачи:', response);
    });
}

// Добавьте в глобальный объект
window.debugSocket = {
    debugEvents: debugSocketEvents,
    testCreateTask,
    testCompleteTask
};