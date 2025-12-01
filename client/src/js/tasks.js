import { socketManager } from './socket.js';
import { authManager } from './auth.js';
import { showNotification, updateTaskCounts } from './ui.js';

class TaskManager {
    constructor() {
        this.tasks = new Map(); // id -> task
        this.initEventListeners();
        this.setupSocketListeners();
    }

    initEventListeners() {
        // Форма создания задачи
        document.getElementById('create-task-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createTask();
        });

        // Кнопка поиска профиля
        document.getElementById('profile-search-btn')?.addEventListener('click', () => {
            this.openSearchModal();
        });

        // Кнопка поиска в модалке
        document.getElementById('search-btn')?.addEventListener('click', () => {
            this.searchProfile();
        });

        // Ввод в поле поиска (на Enter)
        document.getElementById('search-username')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchProfile();
            }
        });
    }

    setupSocketListeners() {
        // Загрузка задач после входа
        socketManager.on('loadTasks', () => {
            this.loadUserTasks();
        });

        // Обновления задач
        socketManager.on('taskCreated', (task) => {
            this.addTask(task);
        });

        socketManager.on('taskUpdated', (task) => {
            this.updateTask(task);
        });

        socketManager.on('taskDeleted', (data) => {
            this.removeTask(data.taskId);
        });

        socketManager.on('sync', (data) => {
            if (data.type === 'task_created') {
                this.addTask(data.task);
            } else if (data.type === 'task_updated') {
                this.updateTask(data.task);
            } else if (data.type === 'task_progress') {
                this.updateTaskProgress(data);
            }
        });
    }

    async createTask() {
        const user = authManager.getCurrentUser();
        if (!user) {
            showNotification('Требуется авторизация', 'error');
            return;
        }

        const title = document.getElementById('task-title').value;
        const description = document.getElementById('task-description').value;
        const shareWith = document.getElementById('task-share').value;

        if (!title.trim()) {
            showNotification('Введите название задачи', 'error');
            return;
        }

        const taskData = {
            title: title.trim(),
            description: description.trim(),
            password: '123' // упрощенная схема
        };

        socketManager.emit('task:create', taskData, (response) => {
            if (response.success) {
                // Поделиться задачей если указаны пользователи
                if (shareWith.trim()) {
                    const userLogins = shareWith.split(',').map(s => s.trim()).filter(s => s);
                    this.shareTask(response.task.id, userLogins);
                }

                // Очищаем форму
                document.getElementById('task-title').value = '';
                document.getElementById('task-description').value = '';
                document.getElementById('task-share').value = '';

                showNotification('Задача создана!', 'success');
            } else {
                showNotification(response.error || 'Ошибка создания задачи', 'error');
            }
        });
    }

    async shareTask(taskId, userLogins) {
        if (!userLogins.length) return;

        const user = authManager.getCurrentUser();
        if (!user) return;

        socketManager.emit('task:share', {
            taskId,
            userLogins,
            password: '123'
        }, (response) => {
            if (response.success) {
                showNotification(`Задача поделена с ${response.sharedCount} пользователями`, 'success');
            } else {
                showNotification(response.error || 'Ошибка при делении задачи', 'error');
            }
        });
    }

    async completeTask(taskId) {
        const user = authManager.getCurrentUser();
        if (!user) return;

        socketManager.emit('task:complete', {
            taskId,
            password: '123'
        }, (response) => {
            if (response.success) {
                showNotification(`Прогресс задачи: ${response.progress}%`, 'info');
            } else {
                showNotification(response.error || 'Ошибка выполнения задачи', 'error');
            }
        });
    }

    async deleteTask(taskId) {
        if (!confirm('Удалить задачу?')) return;

        const user = authManager.getCurrentUser();
        if (!user) return;

        socketManager.emit('task:delete', {
            taskId,
            password: '123'
        }, (response) => {
            if (response.success) {
                showNotification('Задача удалена', 'info');
            } else {
                showNotification(response.error || 'Ошибка удаления задачи', 'error');
            }
        });
    }

    async loadUserTasks() {
        const user = authManager.getCurrentUser();
        if (!user) return;

        socketManager.emit('profile:view', {
            login: user.login
        }, (response) => {
            if (response.success && response.profile) {
                this.updateTasksList(response.profile.tasks || []);
            }
        });
    }

    addTask(task) {
        this.tasks.set(task.id, task);
        this.renderTask(task);
        updateTaskCounts(this.tasks);
    }

    updateTask(updatedTask) {
        this.tasks.set(updatedTask.id, updatedTask);
        
        // Находим существующий элемент
        const existingTask = document.querySelector(`[data-task-id="${updatedTask.id}"]`);
        if (existingTask) {
            existingTask.remove();
        }
        
        this.renderTask(updatedTask);
        updateTaskCounts(this.tasks);
    }

    updateTaskProgress(data) {
        const task = this.tasks.get(data.taskId);
        if (task) {
            task.progress = data.progress;
            if (data.progress === 100) {
                task.status = 'done';
            }
            this.updateTask(task);
        }
    }

    removeTask(taskId) {
        this.tasks.delete(taskId);
        
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (taskElement) {
            taskElement.remove();
        }
        
        updateTaskCounts(this.tasks);
    }

    renderTask(task) {
        const columnId = `${task.status.toLowerCase().replace('progress', 'progress')}-list`;
        const taskList = document.getElementById(columnId);
        
        if (!taskList) return;

        const taskElement = this.createTaskElement(task);
        taskList.appendChild(taskElement);
    }

    createTaskElement(task) {
        const div = document.createElement('div');
        div.className = 'task-card';
        div.dataset.taskId = task.id;
        div.draggable = true;
        div.dataset.status = task.status;

        // Определяем цвет прогресса
        let progressColor = '#4ecdc4';
        if (task.progress < 30) progressColor = '#ff6b6b';
        if (task.progress >= 30 && task.progress < 70) progressColor = '#ffd166';
        if (task.progress >= 70) progressColor = '#1dd1a1';

        div.innerHTML = `
            <div class="task-title">${this.escapeHtml(task.title)}</div>
            ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
            
            ${task.progress !== undefined ? `
                <div class="task-progress">
                    <div class="progress-bar" style="width: ${task.progress}%; background: ${progressColor};"></div>
                </div>
                <div style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;">
                    Прогресс: ${task.progress}%
                </div>
            ` : ''}
            
            <div class="task-meta">
                <span class="task-author">${this.escapeHtml(task.created_by_login || 'Неизвестно')}</span>
                <span>${new Date(task.created_at).toLocaleDateString()}</span>
            </div>
            
            <div class="task-actions">
                <button class="task-btn complete" onclick="taskManager.completeTask('${task.id}')">
                    <i class="fas fa-check"></i> Выполнить
                </button>
                <button class="task-btn delete" onclick="taskManager.deleteTask('${task.id}')">
                    <i class="fas fa-trash"></i> Удалить
                </button>
            </div>
        `;

        return div;
    }

    openSearchModal() {
        const modal = document.getElementById('search-modal');
        modal.classList.add('active');
        document.getElementById('search-username').focus();
    }

    async searchProfile() {
        const username = document.getElementById('search-username').value.trim();
        if (!username) {
            showNotification('Введите логин для поиска', 'error');
            return;
        }

        socketManager.emit('profile:view', { login: username }, (response) => {
            const resultsEl = document.getElementById('search-results');
            if (response.success && response.profile) {
                const profile = response.profile;
                resultsEl.innerHTML = `
                    <div class="profile-result">
                        <h3>👤 ${this.escapeHtml(profile.login)}</h3>
                        <div class="profile-stats">
                            <div>✅ Выполнено задач: <strong>${profile.tasks_completed || 0}</strong></div>
                            <div>📋 Всего задач: <strong>${profile.total_tasks || 0}</strong></div>
                            <div>🤝 Общих задач: <strong>${profile.shared_tasks || 0}</strong></div>
                        </div>
                        <button class="btn-primary" onclick="taskManager.viewProfileTasks('${profile.login}')">
                            <i class="fas fa-eye"></i> Посмотреть задачи
                        </button>
                    </div>
                `;
            } else {
                resultsEl.innerHTML = `
                    <div class="error-message">
                        ❌ Пользователь "${this.escapeHtml(username)}" не найден
                    </div>
                `;
            }
        });
    }

    viewProfileTasks(username) {
        // Закрываем модалку поиска
        document.getElementById('search-modal').classList.remove('active');
        
        // Открываем модалку профиля
        const modal = document.getElementById('profile-modal');
        modal.classList.add('active');
        
        // Загружаем данные профиля
        this.loadProfileData(username);
    }

    async loadProfileData(username) {
        document.getElementById('profile-username').textContent = `Профиль: ${username}`;
        
        socketManager.emit('profile:view', { login: username }, (response) => {
            if (response.success && response.profile) {
                const profile = response.profile;
                
                document.getElementById('profile-tasks-completed').textContent = profile.tasks_completed || 0;
                document.getElementById('profile-total-tasks').textContent = profile.total_tasks || 0;
                document.getElementById('profile-shared-tasks').textContent = profile.shared_tasks || 0;
                
                // Показываем задачи пользователя
                this.displayProfileTasks(profile.tasks || []);
            }
        });
    }

    displayProfileTasks(tasks) {
        const container = document.getElementById('profile-tasks-list');
        if (tasks.length === 0) {
            container.innerHTML = '<p>У пользователя пока нет задач</p>';
            return;
        }

        let html = '<h4>Задачи пользователя:</h4><ul class="profile-tasks">';
        tasks.forEach(task => {
            html += `
                <li>
                    <strong>${this.escapeHtml(task.title)}</strong>
                    <span class="task-status ${task.status}">${this.getStatusText(task.status)}</span>
                    ${task.progress ? `<span class="task-progress">${task.progress}%</span>` : ''}
                </li>
            `;
        });
        html += '</ul>';
        
        container.innerHTML = html;
    }

    getStatusText(status) {
        const statusMap = {
            'todo': 'To Do',
            'inProgress': 'In Progress',
            'done': 'Done'
        };
        return statusMap[status] || status;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getAllTasks() {
        return Array.from(this.tasks.values());
    }
}

export const taskManager = new TaskManager();

// Делаем глобально доступным для вызовов из HTML
window.taskManager = taskManager;