import { socketManager } from './socket.js';
import { showNotification } from './ui.js';

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
        const login = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        if (!login || !password) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        socketManager.emit('user:login', { login, password }, (response) => {
            if (response.success) {
                socketManager.emitEvent('authSuccess', response.user);
                showNotification('Успешный вход!', 'success');
            } else {
                showNotification(response.error || 'Ошибка входа', 'error');
            }
        });
    }

    async register() {
        const login = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;

        if (!login || !password) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        if (password.length < 3) {
            showNotification('Пароль должен быть не менее 3 символов', 'error');
            return;
        }

        socketManager.emit('user:register', { login, password }, (response) => {
            if (response.success) {
                showNotification('Регистрация успешна! Теперь войдите', 'success');
                this.switchTab('login');
                document.getElementById('login-username').value = login;
                document.getElementById('login-password').value = password;
            } else {
                showNotification(response.error || 'Ошибка регистрации', 'error');
            }
        });
    }

    handleAuthSuccess(user) {
        this.currentUser = user;
        this.isAuthenticated = true;

        // Сохраняем в localStorage
        localStorage.setItem('currentUser', JSON.stringify(user));

        // Обновляем интерфейс
        document.getElementById('current-user').textContent = user.login;
        
        // Переключаем страницы
        document.getElementById('auth-page').classList.remove('active');
        document.getElementById('main-page').classList.add('active');

        // Показываем уведомление
        showNotification(`Добро пожаловать, ${user.login}!`, 'success');

        // Запрашиваем задачи пользователя
        socketManager.emitEvent('loadTasks');
    }

    logout() {
        this.currentUser = null;
        this.isAuthenticated = false;
        localStorage.removeItem('currentUser');

        // Переключаем страницы
        document.getElementById('main-page').classList.remove('active');
        document.getElementById('auth-page').classList.add('active');

        // Сбрасываем формы
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';

        showNotification('Вы вышли из системы', 'info');
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
                // Проверяем что есть минимальные данные
                if (user && user.login) {
                    // Автоматически входим
                    socketManager.emit('user:login', { 
                        login: user.login, 
                        password: '123' // упрощенная схема
                    }, (response) => {
                        if (response.success) {
                            this.handleAuthSuccess(response.user);
                        } else {
                            localStorage.removeItem('currentUser');
                        }
                    });
                }
            } catch (e) {
                localStorage.removeItem('currentUser');
            }
        }
    }
}

export const authManager = new AuthManager();