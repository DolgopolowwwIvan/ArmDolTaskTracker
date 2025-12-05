import { io } from 'socket.io-client';

class SocketManager {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.connected = false;
    }

    connect() {
        if (this.socket) return;

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
        });

        this.socket.on('disconnect', () => {
            console.log('❌ WebSocket отключен');
            this.connected = false;
            this.emitEvent('disconnected');
            this.updateConnectionStatus(false);
        });

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

        // ✅ ВАЖНО: Слушаем подтверждение аутентификации от сервера
        this.socket.on('user:authenticated', (data) => {
            console.log('🔐 Сервер подтвердил аутентификацию для:', data.user?.login);
            this.emitEvent('authSuccess', data.user);
        });
    }

    emit(event, data, callback) {
        if (!this.connected) {
            this.showNotification('Нет подключения к серверу', 'error');
            return;
        }

        this.socket.emit(event, data, (response) => {
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
        }
    }

    isConnected() {
        return this.connected;
    }
}

export const socketManager = new SocketManager();