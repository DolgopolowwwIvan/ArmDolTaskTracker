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
        
        socketManager.emit('user:login', { login, password }, (response) => {
            console.log('📨 Ответ на вход:', response);
            
            if (response && response.success) {
                showNotification('Успешный вход!', 'success');
                
                // Сохраняем данные пользователя
                this.currentUser = response.user;
                this.isAuthenticated = true;
                
                // Сохраняем в localStorage
                localStorage.setItem('currentUser', JSON.stringify(response.user));
                
                // Обновляем интерфейс
                this.updateUIAfterLogin(response.user);
                
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
    }

    updateUIAfterLogin(user) {
        // Обновляем имя пользователя
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
        console.log('🚪 Выход из системы');
        
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
                    console.log('🔄 Восстановление сессии для:', user.login);
                    
                    // Показываем страницу авторизации с заполненным логином
                    document.getElementById('login-username').value = user.login;
                    document.getElementById('auth-page').classList.add('active');
                    
                    // Показываем уведомление
                    showNotification('Войдите снова для восстановления сессии', 'info');
                    
                    // Можно попробовать автоматический вход
                    // Но лучше запросить пароль у пользователя
                    
                } else {
                    localStorage.removeItem('currentUser');
                }
            } catch (e) {
                console.error('Ошибка при восстановлении сессии:', e);
                localStorage.removeItem('currentUser');
            }
        }
    }
}

export const authManager = new AuthManager();