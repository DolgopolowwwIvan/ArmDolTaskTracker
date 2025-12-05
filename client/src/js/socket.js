import { io } from 'socket.io-client';

class SocketManager {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.connected = false;
        this.user = null;
    }

    connect() {
        if (this.socket) return;

        console.log('🔌 Подключение к WebSocket...');
        this.socket = io('ws://localhost:3000', {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('✅ WebSocket подключен:', this.socket.id);
            this.connected = true;
            this.emitEvent('connected');
            this.updateConnectionStatus(true);
            
            // Проверяем, есть ли сохраненная сессия
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
                try {
                    const user = JSON.parse(savedUser);
                    if (user && user.login) {
                        // Отправляем токен или запрос на восстановление сессии
                        this.emit('user:restore', { login: user.login });
                    }
                } catch (e) {
                    console.error('Ошибка при восстановлении:', e);
                }
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ WebSocket отключен:', reason);
            this.connected = false;
            this.emitEvent('disconnected');
            this.updateConnectionStatus(false);
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Ошибка подключения WebSocket:', error.message);
            this.showNotification(`Ошибка подключения: ${error.message}`, 'error');
        });

        // Обработка событий задач
        this.socket.on('sync:update', (data) => {
            console.log('🔄 Real-time обновление:', data);
            this.emitEvent('sync', data);
            this.showNotification('Обновление от других пользователей', 'info');
        });

        this.socket.on('task:create', (task) => {
            console.log('📋 Новая задача:', task);
            this.emitEvent('taskCreated', task);
            this.showNotification(`Новая задача: ${task.title}`, 'info');
        });

        this.socket.on('task:update', (task) => {
            console.log('✏️ Задача обновлена:', task);
            this.emitEvent('taskUpdated', task);
        });

        this.socket.on('task:delete', (data) => {
            console.log('🗑️ Задача удалена:', data);
            this.emitEvent('taskDeleted', data);
        });

        // События авторизации
        this.socket.on('user:authenticated', (data) => {
            console.log('🔐 Пользователь аутентифицирован:', data);
            this.user = data.user;
            this.emitEvent('authSuccess', data.user);
            this.showNotification(`Добро пожаловать, ${data.user.login}!`, 'success');
        });

        this.socket.on('user:auth_error', (error) => {
            console.error('❌ Ошибка аутентификации:', error);
            this.showNotification(`Ошибка: ${error.message || error}`, 'error');
            this.emitEvent('authError', error);
        });

        this.socket.on('user:registered', (data) => {
            console.log('✅ Пользователь зарегистрирован:', data);
            this.emitEvent('userRegistered', data);
        });

        this.socket.on('error', (error) => {
            console.error('❌ WebSocket ошибка:', error);
            this.showNotification(`Ошибка: ${error.message || error}`, 'error');
        });

        this.socket.on('user:joined', (data) => {
            console.log('👋 Новый пользователь:', data);
            this.emitEvent('userJoined', data);
            this.updateOnlineCount(data.onlineCount);
        });

        this.socket.on('user:left', (data) => {
            console.log('👋 Пользователь вышел:', data);
            this.emitEvent('userLeft', data);
            this.updateOnlineCount(data.onlineCount);
        });

        // Отладка всех событий
        this.socket.onAny((eventName, ...args) => {
            if (eventName !== 'sync:update') { // Исключаем частые события
                console.log(`📥 [${eventName}]`, args.length > 1 ? args : args[0]);
            }
        });
    }

    emit(event, data, callback) {
        if (!this.connected && !['user:login', 'user:register'].includes(event)) {
            this.showNotification('Нет подключения к серверу', 'error');
            console.error('❌ WebSocket не подключен для события:', event);
            if (callback) callback({ success: false, error: 'Нет подключения к серверу' });
            return;
        }

        console.log('📤 Отправка события:', event, data);
        
        // Для событий авторизации не ждем connected
        if (['user:login', 'user:register'].includes(event) && !this.connected) {
            console.log('⚠️ WebSocket не подключен, но пытаемся отправить:', event);
        }
        
        this.socket.emit(event, data, (response) => {
            console.log('📥 Ответ от сервера на', event, ':', response);
            if (callback) callback(response);
        });
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    emitEvent(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;

        if (connected) {
            statusEl.className = 'status-online';
            statusEl.innerHTML = '<i class="fas fa-circle"></i> Подключен';
        } else {
            statusEl.className = 'status-offline';
            statusEl.innerHTML = '<i class="fas fa-circle"></i> Не подключен';
        }
    }

    updateOnlineCount(count) {
        const countEl = document.getElementById('online-count');
        if (countEl) {
            countEl.textContent = count || 1;
        }
    }

    showNotification(message, type = 'info') {
        this.emitEvent('notification', { message, type });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
            this.user = null;
        }
    }

    isConnected() {
        return this.connected;
    }
    
    getUser() {
        return this.user;
    }
}

export const socketManager = new SocketManager();