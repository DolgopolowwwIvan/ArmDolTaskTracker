import { socketManager } from './socket.js';
import { authManager } from './auth.js';
import { showNotification, updateTaskCounts } from './ui.js';

class TaskManager {
    constructor() {
        this.tasks = new Map(); // id -> task
        this.isProcessingAction = false; // Флаг для отслеживания выполняемых действий
        
        // Пытаемся восстановить задачи из localStorage при запуске
        setTimeout(() => {
            this.restoreTasksFromLocalStorage();
        }, 1000);
        
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

        // Получение задач пользователя после аутентификации
        socketManager.on('user:tasks', (data) => {
            console.log('📥 Получены задачи пользователя:', data.tasks?.length);
            if (data && data.tasks) {
                this.loadTasksFromServer(data.tasks);
            }
        });

        // Обновления задач
        socketManager.on('taskCreated', (task) => {
            console.log('📥 Получено событие taskCreated:', task.id);
            this.addTask(task);
        });

        socketManager.on('taskUpdated', (task) => {
            console.log('📥 Получено событие taskUpdated:', task.id);
            this.updateTask(task);
        });

        socketManager.on('taskDeleted', (data) => {
            console.log('📥 Получено событие taskDeleted:', data.taskId);
            this.removeTask(data.taskId);
        });

        // sync:update события - не показываем уведомления здесь
        socketManager.on('sync', (data) => {
            console.log('📥 Получено sync событие:', data.type, data.task?.id);
            
            if (data.type === 'task_created' && data.task) {
                if (!this.tasks.has(data.task.id)) {
                    this.addTask(data.task);
                }
            } else if (data.type === 'task_updated' && data.task) {
                this.updateTask(data.task);
            } else if (data.type === 'task_progress') {
                this.handleTaskProgress(data);
            } else if (data.type === 'task_deleted') {
                this.removeTask(data.taskId);
            }
            // Убрали уведомления для sync событий
        });
    }

    // Методы для работы с localStorage
    saveTasksToLocalStorage() {
        try {
            const user = authManager.getCurrentUser();
            if (!user) return;
            
            const tasksArray = Array.from(this.tasks.values());
            localStorage.setItem(`tasks_${user.login}`, JSON.stringify(tasksArray));
            localStorage.setItem(`tasks_timestamp_${user.login}`, Date.now().toString());
            console.log('💾 Задачи сохранены в localStorage');
        } catch (error) {
            console.error('❌ Ошибка сохранения задач в localStorage:', error);
        }
    }

    restoreTasksFromLocalStorage() {
        try {
            const user = authManager.getCurrentUser();
            if (!user) return false;
            
            const saved = localStorage.getItem(`tasks_${user.login}`);
            const timestamp = localStorage.getItem(`tasks_timestamp_${user.login}`);
            
            if (saved && timestamp) {
                const age = Date.now() - parseInt(timestamp);
                // Восстанавливаем только если прошло меньше 10 минут
                if (age < 10 * 60 * 1000) {
                    const tasks = JSON.parse(saved);
                    console.log('💾 Восстановление задач из localStorage:', tasks.length);
                    
                    // Очищаем текущие задачи
                    this.tasks.clear();
                    
                    // Очищаем списки
                    ['todo-list', 'done-list'].forEach(listId => {
                        const list = document.getElementById(listId);
                        if (list) list.innerHTML = '';
                    });
                    
                    // Нормализуем и добавляем восстановленные задачи
                    tasks.forEach(task => {
                        const normalizedTask = this.normalizeTaskData(task);
                        this.addTask(normalizedTask);
                    });
                    
                    updateTaskCounts(this.tasks);
                    return true;
                }
            }
        } catch (error) {
            console.error('❌ Ошибка восстановления задач из localStorage:', error);
        }
        return false;
    }

    clearLocalStorageTasks() {
        try {
            const user = authManager.getCurrentUser();
            if (user) {
                localStorage.removeItem(`tasks_${user.login}`);
                localStorage.removeItem(`tasks_timestamp_${user.login}`);
            }
        } catch (error) {
            console.error('Ошибка очистки localStorage:', error);
        }
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
            description: description.trim()
        };

        console.log('📤 Отправка задачи на создание:', taskData);

        // Показываем уведомление сразу, так как успех придет позже через socket
        showNotification('Создание задачи...', 'info');
        
        // Подавляем уведомление от сервера, так как мы уже показали свое
        socketManager.suppressNotificationForNextEvent();

        socketManager.emit('task:create', taskData, (response) => {
            console.log('📥 Ответ на создание задачи:', response);
            
            if (response && response.success) {
                if (shareWith.trim()) {
                    const userLogins = shareWith.split(',').map(s => s.trim()).filter(s => s);
                    this.shareTask(response.task.id, userLogins);
                }

                document.getElementById('task-title').value = '';
                document.getElementById('task-description').value = '';
                document.getElementById('task-share').value = '';

                // Уведомление уже будет показано через socket событие task:create
                // поэтому здесь не показываем
                
            } else {
                const errorMsg = response?.error || 'Ошибка создания задачи';
                showNotification(errorMsg, 'error');
            }
        });
    }

    async shareTask(taskId, userLogins) {
        if (!userLogins.length) return;

        const user = authManager.getCurrentUser();
        if (!user) return;

        console.log('🤝 Поделиться задачей:', taskId, 'с:', userLogins);

        socketManager.emit('task:share', {
            taskId,
            userLogins
        }, (response) => {
            if (response && response.success) {
                showNotification(`Задача поделена с ${response.sharedCount} пользователями`, 'success');
            } else {
                const errorMsg = response?.error || 'Ошибка при делении задачи';
                showNotification(errorMsg, 'error');
            }
        });
    }

    async completeTask(taskId) {
        console.log('✅ Пытаемся выполнить задачу:', taskId);
        
        const user = authManager.getCurrentUser();
        if (!user) {
            showNotification('Требуется авторизация', 'error');
            return;
        }

        const numericTaskId = Number(taskId);
        
        // Получаем текущую задачу
        const currentTask = this.tasks.get(numericTaskId);
        if (currentTask && currentTask.progress === 100) {
            showNotification('Задача уже выполнена', 'info');
            return;
        }
        
        // Проверяем, не выполняется ли уже действие
        if (this.isProcessingAction) {
            console.log('⚠️ Действие уже выполняется');
            return;
        }
        
        this.isProcessingAction = true;
        
        // Анимация обновления
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (taskElement) {
            taskElement.classList.add('updating');
        }
        
        // Показываем уведомление о начале выполнения
        showNotification('Выполнение задачи...', 'info');
        
        socketManager.emit('task:complete', {
            taskId: numericTaskId
        }, (response) => {
            console.log('📨 Ответ на выполнение задачи:', response);
            
            this.isProcessingAction = false;
            
            if (taskElement) {
                taskElement.classList.remove('updating');
            }
            
            if (response && response.success) {
                // Уведомление о прогрессе показываем только здесь, а не в socket событиях
                showNotification(`Прогресс задачи: ${response.progress || 0}%`, 'info');
                
                if (response.task) {
                    // Используем данные от сервера
                    const normalizedTask = this.normalizeTaskData(response.task);
                    this.updateTask(normalizedTask);
                } else {
                    // Обновляем локально
                    const task = this.tasks.get(numericTaskId);
                    if (task) {
                        task.progress = response.progress;
                        task.updated_at = new Date().toISOString();
                        
                        if (response.progress === 100) {
                            task.status = 'done';
                            task.completed_at = new Date().toISOString();
                        } else if (response.progress > 0) {
                            task.status = 'inProgress';
                        }
                        
                        this.updateTask(task);
                    }
                }
            } else {
                const errorMsg = response?.error || 'Ошибка выполнения задачи';
                showNotification(errorMsg, 'error');
            }
        });
    }

    async deleteTask(taskId) {
        console.log('🗑️ Пытаемся удалить задачу:', taskId);
        
        if (!confirm('Удалить задачу?')) return;

        const user = authManager.getCurrentUser();
        if (!user) {
            showNotification('Требуется авторизация', 'error');
            return;
        }

        // Проверяем, не выполняется ли уже действие
        if (this.isProcessingAction) {
            console.log('⚠️ Действие уже выполняется');
            return;
        }
        
        this.isProcessingAction = true;
        
        // Подавляем уведомление от сервера, так как мы покажем свое
        socketManager.suppressNotificationForNextEvent();
        
        // Показываем уведомление сразу
        showNotification('Удаление задачи...', 'info');

        socketManager.emit('task:delete', {
            taskId: Number(taskId)
        }, (response) => {
            console.log('📨 Ответ на удаление задачи:', response);
            
            this.isProcessingAction = false;
            
            if (response && response.success) {
                // Уведомление уже показали выше, удаляем задачу
                this.removeTask(taskId);
            } else {
                const errorMsg = response?.error || 'Ошибка удаления задачи';
                showNotification(errorMsg, 'error');
            }
        });
    }

    async loadUserTasks() {
        const user = authManager.getCurrentUser();
        if (!user) {
            console.log('❌ Нет пользователя для загрузки задач');
            return;
        }

        console.log('🔄 Загружаем задачи для:', user.login);

        // Сначала пробуем через profile:view
        socketManager.emit('profile:view', {
            login: user.login
        }, (response) => {
            console.log('📨 Ответ profile:view:', response);
            
            if (response && response.success && response.profile) {
                const tasks = response.profile.tasks || [];
                console.log('📋 Получено задач через profile:view:', tasks.length);
                
                this.loadTasksFromServer(tasks);
                
            } else {
                console.error('❌ Ошибка загрузки задач через profile:view:', response?.error);
                
                // Пробуем через get_user_tasks
                socketManager.emit('get_user_tasks', {
                    login: user.login
                }, (response2) => {
                    console.log('📨 Ответ get_user_tasks:', response2);
                    
                    if (response2 && response2.success && response2.tasks) {
                        console.log('📋 Получено задач через get_user_tasks:', response2.tasks.length);
                        this.loadTasksFromServer(response2.tasks);
                    } else {
                        console.error('❌ Ошибка загрузки задач через get_user_tasks:', response2?.error);
                        showNotification('Не удалось загрузить задачи', 'error');
                    }
                });
            }
        });
    }

    loadTasksFromServer(tasks) {
        console.log('🔄 Загрузка задач с сервера:', tasks.length);
        
        // Очищаем текущие задачи
        this.tasks.clear();
        
        // Очищаем все списки задач
        ['todo-list', 'done-list'].forEach(listId => {
            const list = document.getElementById(listId);
            if (list) list.innerHTML = '';
        });
        
        // Нормализуем и добавляем каждую задачу
        tasks.forEach(task => {
            const normalizedTask = this.normalizeTaskData(task);
            this.addTask(normalizedTask);
        });
        
        // Обновляем счетчики
        updateTaskCounts(this.tasks);
        
        // Сохраняем в localStorage
        this.saveTasksToLocalStorage();
    }

    // Нормализация данных задачи
    normalizeTaskData(task) {
        const taskId = Number(task.id);
        const status = task.status || 'todo';
        
        // Автоматически устанавливаем прогресс 100% для done задач
        let progress = task.progress || 0;
        if (status === 'done' && progress < 100) {
            progress = 100;
            console.log(`✅ Установлен прогресс 100% для done задачи ${taskId}`);
        }
        
        // Определяем дату выполнения для done задач
        let completed_at = task.completed_at;
        if (status === 'done' && !completed_at) {
            completed_at = task.updated_at || new Date().toISOString();
        }
        
        return {
            ...task,
            id: taskId,
            title: task.title || 'Без названия',
            description: task.description || '',
            progress: progress,
            status: status,
            created_by_login: task.created_by_login || 'Неизвестно',
            created_at: task.created_at || new Date().toISOString(),
            updated_at: task.updated_at || task.created_at || new Date().toISOString(),
            completed_at: completed_at
        };
    }

    addTask(task) {
        if (!task || !task.id) {
            console.error('❌ Некорректная задача:', task);
            return;
        }
        
        // Нормализуем данные перед добавлением
        const normalizedTask = this.normalizeTaskData(task);
        
        if (this.tasks.has(normalizedTask.id)) {
            console.log('⚠️ Задача уже существует:', normalizedTask.id);
            return;
        }
        
        this.tasks.set(normalizedTask.id, normalizedTask);
        this.renderTask(normalizedTask);
        updateTaskCounts(this.tasks);
        
        // Сохраняем в localStorage
        this.saveTasksToLocalStorage();
    }

    updateTask(updatedTask) {
        if (!updatedTask || !updatedTask.id) {
            console.error('❌ Некорректная задача для обновления:', updatedTask);
            return;
        }
        
        const taskId = Number(updatedTask.id);
        
        // Объединяем с существующими данными и нормализуем
        const existingTask = this.tasks.get(taskId) || {};
        const mergedTask = {
            ...existingTask,
            ...updatedTask,
            id: taskId,
            // Сохраняем критически важные поля если их нет в обновлении
            title: updatedTask.title || existingTask.title || 'Без названия',
            created_by_login: updatedTask.created_by_login || existingTask.created_by_login || 'Неизвестно',
            created_at: updatedTask.created_at || existingTask.created_at || new Date().toISOString(),
        };
        
        // Нормализуем финальную задачу
        const normalizedTask = this.normalizeTaskData(mergedTask);
        
        this.tasks.set(normalizedTask.id, normalizedTask);
        
        const existingElement = document.querySelector(`[data-task-id="${normalizedTask.id}"]`);
        
        if (existingElement) {
            // Обновляем существующий элемент
            this.updateTaskElement(existingElement, normalizedTask);
        } else {
            // Создаем новый элемент
            this.renderTask(normalizedTask);
        }
        
        updateTaskCounts(this.tasks);
        
        // Сохраняем в localStorage
        this.saveTasksToLocalStorage();
    }

    updateTaskElement(element, task) {
        // 1. Обновляем статус
        element.dataset.status = task.status || 'todo';
        
        // 2. Обновляем прогресс
        const progressBar = element.querySelector('.progress-bar');
        const progressText = element.querySelector('.progress-text');
        
        if (progressBar && task.progress !== undefined) {
            let progressColor = '#4ecdc4';
            if (task.progress < 30) progressColor = '#ff6b6b';
            if (task.progress >= 30 && task.progress < 70) progressColor = '#ffd166';
            if (task.progress >= 70) progressColor = '#1dd1a1';
            
            progressBar.style.width = `${task.progress}%`;
            progressBar.style.background = progressColor;
        }
        
        if (progressText && task.progress !== undefined) {
            progressText.textContent = `Прогресс: ${task.progress}%`;
        }
        
        // 3. Обновляем дату
        const dateElement = element.querySelector('.task-meta span:last-child');
        if (dateElement) {
            if (task.completed_at) {
                dateElement.textContent = `Выполнено: ${new Date(task.completed_at).toLocaleDateString()}`;
            } else if (task.updated_at && task.updated_at !== task.created_at) {
                dateElement.textContent = `Обновлено: ${new Date(task.updated_at).toLocaleDateString()}`;
            } else if (task.created_at) {
                dateElement.textContent = `Создано: ${new Date(task.created_at).toLocaleDateString()}`;
            }
        }
        
        // 4. Обновляем кнопку выполнения
        const completeBtn = element.querySelector('.complete');
        if (completeBtn) {
            if (task.progress === 100) {
                completeBtn.innerHTML = '<i class="fas fa-check-double"></i> Выполнено';
                completeBtn.disabled = true;
                completeBtn.style.opacity = '0.5';
                completeBtn.style.cursor = 'not-allowed';
            } else {
                completeBtn.innerHTML = '<i class="fas fa-check"></i> Выполнить';
                completeBtn.disabled = false;
                completeBtn.style.opacity = '1';
                completeBtn.style.cursor = 'pointer';
            }
            
            // Обновляем обработчик
            completeBtn.onclick = () => window.taskManager.completeTask(task.id);
        }
        
        // 5. Перемещаем в правильную колонку если нужно
        const targetColumnId = task.status === 'done' ? 'done-list' : 'todo-list';
        const currentList = element.parentElement;
        const targetList = document.getElementById(targetColumnId);
        
        if (targetList && currentList && currentList !== targetList) {
            currentList.removeChild(element);
            targetList.appendChild(element);
        }
    }

    handleTaskProgress(data) {
        const task = this.tasks.get(data.taskId);
        if (task) {
            task.progress = data.progress;
            task.updated_at = new Date().toISOString();
            
            if (data.progress === 100) {
                task.status = 'done';
                task.completed_at = new Date().toISOString();
            } else if (data.progress > 0) {
                task.status = 'inProgress';
            }
            
            this.updateTask(task);
        }
    }

    removeTask(taskId) {
        const numericTaskId = Number(taskId);
        this.tasks.delete(numericTaskId);
        
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (taskElement) {
            taskElement.remove();
        }
        
        updateTaskCounts(this.tasks);
        
        // Сохраняем в localStorage
        this.saveTasksToLocalStorage();
    }

    renderTask(task) {
        if (!task || !task.id) {
            console.error('❌ Некорректная задача для отрисовки:', task);
            return;
        }
        
        // Убедимся, что задача нормализована
        const normalizedTask = this.normalizeTaskData(task);
        
        const columnId = normalizedTask.status === 'done' ? 'done-list' : 'todo-list';
        const taskList = document.getElementById(columnId);
        
        if (!taskList) {
            console.error('Список задач не найден:', columnId);
            return;
        }

        // Проверяем, нет ли уже такой задачи
        const existingTask = taskList.querySelector(`[data-task-id="${normalizedTask.id}"]`);
        if (existingTask) {
            console.log('⚠️ Задача уже отображена:', normalizedTask.id);
            this.updateTaskElement(existingTask, normalizedTask);
            return;
        }

        const taskElement = this.createTaskElement(normalizedTask);
        taskList.appendChild(taskElement);
    }

    createTaskElement(task) {
        const div = document.createElement('div');
        div.className = 'task-card';
        div.dataset.taskId = task.id;
        div.draggable = true;
        div.dataset.status = task.status || 'todo';

        // Цвет прогресса
        let progressColor = '#4ecdc4';
        const progress = task.progress || 0;
        if (progress < 30) progressColor = '#ff6b6b';
        if (progress >= 30 && progress < 70) progressColor = '#ffd166';
        if (progress >= 70) progressColor = '#1dd1a1';

        // Текст даты
        let dateText = '';
        if (task.completed_at) {
            dateText = `Выполнено: ${new Date(task.completed_at).toLocaleDateString()}`;
        } else if (task.updated_at && task.updated_at !== task.created_at) {
            dateText = `Обновлено: ${new Date(task.updated_at).toLocaleDateString()}`;
        } else {
            dateText = `Создано: ${new Date(task.created_at).toLocaleDateString()}`;
        }

        // Автор
        const author = task.created_by_login || 'Неизвестно';

        div.innerHTML = `
            <div class="task-title">${this.escapeHtml(task.title || 'Без названия')}</div>
            ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
            
            <div class="task-progress">
                <div class="progress-bar" style="width: ${progress}%; background: ${progressColor};"></div>
            </div>
            <div class="progress-text" style="text-align: center; font-size: 12px; color: #666; margin-bottom: 10px;">
                Прогресс: ${progress}%
            </div>
            
            <div class="task-meta">
                <span class="task-author">${this.escapeHtml(author)}</span>
                <span>${dateText}</span>
            </div>
            
            <div class="task-actions">
                <button class="task-btn complete" onclick="window.taskManager.completeTask('${task.id}')" 
                    ${progress === 100 ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : 'style="cursor: pointer;"'}>
                    <i class="fas ${progress === 100 ? 'fa-check-double' : 'fa-check'}"></i> 
                    ${progress === 100 ? 'Выполнено' : 'Выполнить'}
                </button>
                <button class="task-btn delete" onclick="window.taskManager.deleteTask('${task.id}')">
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
            if (response && response.success && response.profile) {
                const profile = response.profile;
                resultsEl.innerHTML = `
                    <div class="profile-result">
                        <h3>👤 ${this.escapeHtml(profile.login)}</h3>
                        <div class="profile-stats">
                            <div>✅ Выполнено задач: <strong>${profile.tasks_completed || 0}</strong></div>
                            <div>📋 Всего задач: <strong>${profile.total_tasks || 0}</strong></div>
                            <div>🤝 Общих задач: <strong>${profile.shared_tasks || 0}</strong></div>
                        </div>
                        <button class="btn-primary" onclick="window.taskManager.viewProfileTasks('${profile.login}')">
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
        document.getElementById('search-modal').classList.remove('active');
        document.getElementById('profile-modal').classList.add('active');
        this.loadProfileData(username);
    }

    async loadProfileData(username) {
        document.getElementById('profile-username').textContent = `Профиль: ${username}`;
        
        socketManager.emit('profile:view', { login: username }, (response) => {
            if (response && response.success && response.profile) {
                const profile = response.profile;
                
                document.getElementById('profile-tasks-completed').textContent = profile.tasks_completed || 0;
                document.getElementById('profile-total-tasks').textContent = profile.total_tasks || 0;
                document.getElementById('profile-shared-tasks').textContent = profile.shared_tasks || 0;
                
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
            // Нормализуем задачу для отображения
            const normalizedTask = this.normalizeTaskData(task);
            html += `
                <li>
                    <strong>${this.escapeHtml(normalizedTask.title)}</strong>
                    <span class="task-status ${normalizedTask.status}">${this.getStatusText(normalizedTask.status)}</span>
                    <span class="task-progress">${normalizedTask.progress}%</span>
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
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getAllTasks() {
        return Array.from(this.tasks.values());
    }
}

export const taskManager = new TaskManager();
window.taskManager = taskManager;