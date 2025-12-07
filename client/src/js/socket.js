import { io } from 'socket.io-client';

class SocketManager {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.connected = false;
        this.user = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.suppressNotifications = false;
        
        // ⚠️ ИЗМЕНИТЕ ЭТУ СТРОКУ НА ВАШ ВНЕШНИЙ АДРЕС ⚠️
        this.SERVER_URL = 'http://217.71.129.139:5958'; // Ваш внешний IP с портом
    }

    connect() {
        if (this.socket && this.connected) return;

        console.log('🔌 Подключение к WebSocket:', this.SERVER_URL);
        
        // ⚠️ ИСПОЛЬЗУЙТЕ HTTP ДЛЯ SOCKET.IO ⚠️
        this.socket = io(this.SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            autoConnect: true,
            forceNew: true, // Важно для переподключений
            path: '/socket.io/' // Стандартный путь для Socket.IO
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('✅ WebSocket подключен:', this.socket.id);
            console.log('📡 URL сервера:', this.SERVER_URL);
            this.connected = true;
            this.reconnectAttempts = 0;
            this.emitEvent('connected');
            this.updateConnectionStatus(true);
            
            const savedUser = localStorage.getItem('currentUser');
            if (savedUser) {
                try {
                    const user = JSON.parse(savedUser);
                    if (user && user.login) {
                        console.log('🔄 Восстановление сессии для:', user.login);
                        this.emit('user:restore', { login: user.login });
                    }
                } catch (e) {
                    console.error('Ошибка при восстановлении:', e);
                }
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ WebSocket отключен. Причина:', reason);
            this.connected = false;
            this.emitEvent('disconnected');
            this.updateConnectionStatus(false);
            
            if (reason === 'io server disconnect') {
                this.socket.connect();
            }
        });

        this.socket.on('connect_error', (error) => {
            this.reconnectAttempts++;
            console.error('❌ Ошибка подключения WebSocket к', this.SERVER_URL, ':', error.message);
            console.log(`Попытка переподключения: ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            // Диагностика ошибок
            if (error.message.includes('Failed to fetch')) {
                console.error('⚠️ Сервер не отвечает на', this.SERVER_URL);
            } else if (error.message.includes('xhr poll error')) {
                console.error('⚠️ Проблема с CORS или настройками сервера');
            } else if (error.message.includes('timeout')) {
                console.error('⚠️ Таймаут подключения к серверу');
            }
            
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                this.showNotification(`Не удалось подключиться к ${this.SERVER_URL}`, 'error');
            } else {
                this.showNotification(`Попытка подключения ${this.reconnectAttempts}...`, 'warning');
            }
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Успешное переподключение после ${attemptNumber} попыток`);
            this.showNotification('Соединение восстановлено', 'success');
        });

        this.socket.on('reconnect_error', (error) => {
            console.error('Ошибка переподключения:', error);
        });

        this.socket.on('reconnect_failed', () => {
            console.error('Не удалось переподключиться после всех попыток');
            this.showNotification('Не удалось восстановить соединение', 'error');
        });

        this.socket.on('sync:update', (data) => {
            console.log('🔄 Real-time обновление:', data.type);
            this.emitEvent('sync', data);
        });

        this.socket.on('task:create', (task) => {
            console.log('📋 Новая задача от сервера:', task.id);
            this.emitEvent('taskCreated', task);
            
            if (!this.suppressNotifications) {
                this.showNotification(`Задача создана: ${task.title}`, 'success');
            }
            this.suppressNotifications = false;
        });

        this.socket.on('task:update', (task) => {
            console.log('✏️ Задача обновлена сервером:', task.id);
            this.emitEvent('taskUpdated', task);
        });

        this.socket.on('task:delete', (data) => {
            console.log('🗑️ Задача удалена сервером:', data.taskId);
            this.emitEvent('taskDeleted', data);
            
            if (!this.suppressNotifications) {
                this.showNotification('Задача удалена', 'info');
            }
            this.suppressNotifications = false;
        });

        this.socket.on('user:authenticated', (data) => {
            console.log('🔐 Пользователь аутентифицирован:', data.user?.login);
            this.user = data.user;
            this.emitEvent('authSuccess', data.user);
            this.showNotification(`Добро пожаловать, ${data.user?.login}!`, 'success');
            
            if (data.user && data.user.login) {
                console.log('🔄 Запрашиваем задачи после аутентификации...');
                
                this.emit('profile:view', { login: data.user.login }, (response) => {
                    if (response && response.success && response.profile) {
                        console.log('✅ Задачи получены через profile:view');
                        this.emitEvent('user:tasks', { tasks: response.profile.tasks || [] });
                    } else {
                        this.emit('get_user_tasks', { login: data.user.login }, (response2) => {
                            if (response2 && response2.success && response2.tasks) {
                                console.log('✅ Задачи получены через get_user_tasks');
                                this.emitEvent('user:tasks', { tasks: response2.tasks || [] });
                            }
                        });
                    }
                });
            }
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

        this.socket.on('user:restored', (data) => {
            console.log('🔄 Сессия восстановлена:', data.user?.login);
            if (data.user) {
                this.user = data.user;
                this.emitEvent('authSuccess', data.user);
                this.showNotification(`С возвращением, ${data.user.login}!`, 'success');
            }
        });

        this.socket.on('error', (error) => {
            console.error('❌ WebSocket ошибка:', error);
            this.showNotification(`Ошибка: ${error.message || error}`, 'error');
        });

        this.socket.on('user:tasks', (data) => {
            console.log('📥 Получены задачи пользователя:', data.tasks?.length);
            this.emitEvent('user:tasks', data);
        });

        // Отладка всех событий (кроме частых)
        this.socket.onAny((eventName, ...args) => {
            if (!['sync:update', 'ping', 'pong'].includes(eventName)) {
                console.log(`📥 [${eventName}]`, args.length > 1 ? args : args[0]);
            }
        });
    }

    emit(event, data, callback) {
        this.suppressNotifications = false;
        
        if (!this.connected && !['user:login', 'user:register', 'user:restore'].includes(event)) {
            this.showNotification('Нет подключения к серверу', 'error');
            console.error('❌ WebSocket не подключен для события:', event);
            if (callback) callback({ success: false, error: 'Нет подключения к серверу' });
            return;
        }

        console.log('📤 Отправка события:', event, data);
        
        try {
            this.socket.emit(event, data, (response) => {
                console.log('📥 Ответ от сервера на', event, ':', response);
                if (callback) callback(response);
            });
        } catch (error) {
            console.error('❌ Ошибка отправки события:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    }

    suppressNotificationForNextEvent() {
        this.suppressNotifications = true;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        
        if (this.connected && event === 'connected') {
            setTimeout(() => callback(), 0);
        }
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
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Ошибка в обработчике события ${event}:`, error);
                }
            });
        }
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;

        if (connected) {
            statusEl.className = 'status-online';
            statusEl.innerHTML = `<i class="fas fa-circle"></i> Подключен к ${this.SERVER_URL}`;
        } else {
            statusEl.className = 'status-offline';
            statusEl.innerHTML = '<i class="fas fa-circle"></i> Не подключен';
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
            this.listeners.clear();
        }
    }

    isConnected() {
        return this.connected && this.socket?.connected;
    }
    
    getUser() {
        return this.user;
    }
    
    checkConnection() {
        return new Promise((resolve) => {
            if (this.isConnected()) {
                resolve(true);
            } else {
                const checkInterval = setInterval(() => {
                    if (this.isConnected()) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 100);
                
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve(false);
                }, 5000);
            }
        });
    }
    
    waitForConnection() {
        return new Promise((resolve) => {
            if (this.isConnected()) {
                resolve();
            } else {
                const handler = () => {
                    this.off('connected', handler);
                    resolve();
                };
                this.on('connected', handler);
            }
        });
    }
}

export const socketManager = new SocketManager();

// Автоматическое подключение при загрузке
window.addEventListener('load', () => {
    setTimeout(() => {
        console.log('🌐 ArmDol Task Tracker запускается...');
        console.log('📡 Адрес сервера:', socketManager.SERVER_URL);
        socketManager.connect();
    }, 100);
});

// Автоматическое переподключение при потере фокуса/возвращении
window.addEventListener('focus', () => {
    if (!socketManager.isConnected()) {
        console.log('🔄 Переподключение при возвращении на страницу...');
        socketManager.connect();
    }
});

// Отображение информации о сервере при загрузке
console.log(`
🌐 ArmDol Task Tracker Client
📡 Сервер: http://217.71.129.139:5958
🔗 WebSocket: ws://217.71.129.139:5958/socket.io/
⏰ ${new Date().toLocaleString()}
`);