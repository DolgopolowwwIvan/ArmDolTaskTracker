import { socketManager } from './socket.js';
import { showNotification } from './ui.js';
import { taskManager } from './tasks.js';

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        
        this.initEventListeners();
    }

    initEventListeners() {
        // Переключение между вкладками
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Форма входа
        document.getElementById('login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // Форма регистрации
        document.getElementById('register-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.register();
        });

        // Кнопка выхода
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            this.logout();
        });

        // Подписка на успешный вход
        socketManager.on('authSuccess', (user) => {
            this.handleAuthSuccess(user);
        });
        
        // Подписка на подтверждение от сервера
        socketManager.on('user:authenticated', (data) => {
            console.log('🔐 Получено подтверждение аутентификации:', data);
            if (data && data.user) {
                this.handleAuthSuccess(data.user);
            }
        });
    }

    switchTab(tab) {
        // Обновляем активные кнопки
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Показываем активную форму
        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.toggle('active', form.id === `${tab}-form`);
        });
    }

    async login() {
        const login = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;

        if (!login || !password) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        console.log('🔐 Попытка входа:', login);
        
        // Показываем уведомление о входе
        showNotification('Вход в систему...', 'info');
        
        socketManager.emit('user:login', { login, password }, (response) => {
            console.log('📨 Ответ на вход:', response);
            
            if (response && response.success) {
                // Уведомление об успешном входе покажет socket событие user:authenticated
                // поэтому здесь не показываем
                
                // Сохраняем данные пользователя
                this.currentUser = response.user;
                this.isAuthenticated = true;
                
                // Сохраняем в localStorage
                localStorage.setItem('currentUser', JSON.stringify(response.user));
                
                // Обновляем интерфейс
                this.updateUIAfterLogin(response.user);
                
                // Загружаем задачи пользователя
                this.loadUserTasks();
                
            } else {
                const errorMsg = response?.error || 'Ошибка входа';
                console.error('❌ Ошибка входа:', errorMsg);
                showNotification(errorMsg, 'error');
            }
        });
    }

    async register() {
        const login = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;

        if (!login || !password) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        if (password.length < 3) {
            showNotification('Пароль должен быть не менее 3 символов', 'error');
            return;
        }

        console.log('📝 Попытка регистрации:', login);
        
        // Показываем уведомление о регистрации
        showNotification('Регистрация...', 'info');
        
        socketManager.emit('user:register', { login, password }, (response) => {
            console.log('📨 Ответ на регистрацию:', response);
            
            if (response && response.success) {
                showNotification('Регистрация успешна! Теперь войдите', 'success');
                this.switchTab('login');
                document.getElementById('login-username').value = login;
                document.getElementById('login-password').value = password;
                
                // Автоматически входим после регистрации
                setTimeout(() => {
                    this.login();
                }, 500);
                
            } else {
                const errorMsg = response?.error || 'Ошибка регистрации';
                console.error('❌ Ошибка регистрации:', errorMsg);
                showNotification(errorMsg, 'error');
            }
        });
    }

    handleAuthSuccess(user) {
        console.log('✅ Успешная аутентификация:', user);
        
        this.currentUser = user;
        this.isAuthenticated = true;

        // Сохраняем в localStorage
        localStorage.setItem('currentUser', JSON.stringify(user));

        // Обновляем интерфейс
        this.updateUIAfterLogin(user);
        
        // Загружаем задачи пользователя
        this.loadUserTasks();
    }

    updateUIAfterLogin(user) {
        // Обновляем имя пользователя
        document.getElementById('current-user').textContent = user.login;
        
        // Переключаем страницы
        document.getElementById('auth-page').classList.remove('active');
        document.getElementById('main-page').classList.add('active');

    }

    // Загрузить задачи пользователя
    loadUserTasks() {
        if (this.currentUser && this.isAuthenticated) {
            console.log('🔄 Загрузка задач для пользователя:', this.currentUser.login);
            
            // Используем taskManager для загрузки задач
            if (window.taskManager && typeof window.taskManager.loadUserTasks === 'function') {
                setTimeout(() => {
                    window.taskManager.loadUserTasks();
                }, 500); // Небольшая задержка для стабилизации соединения
            }
        }
    }

    logout() {
        console.log('🚪 Выход из системы');
        
        // Показываем уведомление о выходе
        showNotification('Выход из системы...', 'info');
        
        // Отправляем на сервер событие выхода
        socketManager.emit('user:logout', {}, (response) => {
            console.log('Ответ на выход:', response);
        });
        
        this.currentUser = null;
        this.isAuthenticated = false;
        localStorage.removeItem('currentUser');

        // Переключаем страницы
        document.getElementById('main-page').classList.remove('active');
        document.getElementById('auth-page').classList.add('active');
        
        // Переключаем на вкладку входа
        this.switchTab('login');

        // Сбрасываем формы
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';

        // Очищаем задачи
        if (window.taskManager && window.taskManager.tasks) {
            window.taskManager.tasks.clear();
        }
        
        // Очищаем списки задач
        ['todo-list', 'done-list'].forEach(listId => {
            const list = document.getElementById(listId);
            if (list) list.innerHTML = '';
        });

        // Уведомление уже показали выше
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isLoggedIn() {
        return this.isAuthenticated;
    }

    // Восстановление сессии из localStorage
    restoreSession() {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (user && user.login) {
                    console.log('🔄 Восстановление сессии для:', user.login);
                    
                    // Показываем страницу авторизации с заполненным логином
                    document.getElementById('login-username').value = user.login;
                    document.getElementById('auth-page').classList.add('active');
                    
                    // Сохраняем пользователя для быстрого доступа
                    this.currentUser = user;
                    
                    // Ждем подключения WebSocket и автоматически входим
                    if (socketManager.isConnected()) {
                        this.attemptAutoLogin(user);
                    } else {
                        // Ждем подключения WebSocket
                        socketManager.on('connected', () => {
                            console.log('🔌 WebSocket подключен, пытаемся восстановить сессию...');
                            this.attemptAutoLogin(user);
                        });
                    }
                    
                } else {
                    localStorage.removeItem('currentUser');
                }
            } catch (e) {
                console.error('Ошибка при восстановлении сессии:', e);
                localStorage.removeItem('currentUser');
            }
        }
    }
    
    // Попытка автоматического входа
    attemptAutoLogin(user) {
        console.log('🔐 Попытка автоматического входа для:', user.login);
        
        socketManager.emit('user:login', { 
            login: user.login, 
            password: '123' // упрощенная схема
        }, (response) => {
            console.log('📨 Ответ на автоматический вход:', response);
            
            if (response && response.success) {
                console.log('✅ Автоматический вход успешен');
                this.handleAuthSuccess(response.user);
            } else {
                console.log('❌ Автоматический вход не удался, показываем форму');
                // Если автоматический вход не удался, просто заполняем поле логина
                document.getElementById('login-username').value = user.login;
                showNotification('Войдите снова', 'info');
            }
        });
    }
}

export const authManager = new AuthManager();