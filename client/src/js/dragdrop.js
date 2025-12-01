import { socketManager } from './socket.js';
import { authManager } from './auth.js';
import { showNotification } from './ui.js';

class DragDropManager {
    constructor() {
        this.draggedTask = null;
        this.initDragAndDrop();
    }

    initDragAndDrop() {
        // Делаем все списки задач drop-зонами
        document.querySelectorAll('.task-list').forEach(list => {
            list.addEventListener('dragover', this.handleDragOver.bind(this));
            list.addEventListener('dragenter', this.handleDragEnter.bind(this));
            list.addEventListener('dragleave', this.handleDragLeave.bind(this));
            list.addEventListener('drop', this.handleDrop.bind(this));
        });

        // Обработчики для самих задач
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        document.addEventListener('dragend', this.handleDragEnd.bind(this));
    }

    handleDragStart(e) {
        if (!e.target.classList.contains('task-card')) return;

        this.draggedTask = e.target;
        e.target.classList.add('dragging');
        
        // Устанавливаем данные для передачи
        e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
        e.dataTransfer.effectAllowed = 'move';
    }

    handleDragEnd(e) {
        if (!e.target.classList.contains('task-card')) return;
        
        e.target.classList.remove('dragging');
        this.draggedTask = null;
        
        // Убираем подсветку со всех drop-зон
        document.querySelectorAll('.task-list').forEach(list => {
            list.classList.remove('drag-over');
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        if (e.target.classList.contains('task-list')) {
            e.target.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        if (e.target.classList.contains('task-list')) {
            e.target.classList.remove('drag-over');
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        
        if (!e.target.classList.contains('task-list')) return;
        
        e.target.classList.remove('drag-over');
        
        const taskId = e.dataTransfer.getData('text/plain');
        const newStatus = e.target.dataset.status;
        
        if (!taskId || !newStatus) return;

        // Находим задачу
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (!taskElement) return;

        const oldStatus = taskElement.dataset.status;
        
        // Если статус не изменился - ничего не делаем
        if (oldStatus === newStatus) return;

        // Обновляем статус на сервере
        await this.updateTaskStatus(taskId, newStatus);
        
        // Перемещаем задачу в новый список
        this.moveTaskToColumn(taskElement, newStatus);
    }

    async updateTaskStatus(taskId, newStatus) {
        const user = authManager.getCurrentUser();
        if (!user) {
            showNotification('Требуется авторизация', 'error');
            return;
        }

        // Статус для отправки на сервер
        const statusMap = {
            'todo': 'todo',
            'inProgress': 'inProgress',
            'done': 'done'
        };

        const serverStatus = statusMap[newStatus];
        if (!serverStatus) {
            console.error('Неизвестный статус:', newStatus);
            return;
        }

        socketManager.emit('task:update', {
            taskId,
            status: serverStatus,
            password: '123' // упрощенная схема
        }, (response) => {
            if (response.success) {
                showNotification('Статус задачи обновлен', 'success');
            } else {
                showNotification(response.error || 'Ошибка обновления задачи', 'error');
                // Возвращаем задачу на место в случае ошибки
                // TODO: Реализовать rollback
            }
        });
    }

    moveTaskToColumn(taskElement, newStatus) {
        // Обновляем data-атрибут
        taskElement.dataset.status = newStatus;
        
        // Находим новый список
        const columnId = `${newStatus.toLowerCase().replace('progress', 'progress')}-list`;
        const newList = document.getElementById(columnId);
        
        if (newList) {
            // Удаляем из старого списка
            taskElement.remove();
            // Добавляем в новый
            newList.appendChild(taskElement);
            
            // Обновляем счетчики задач
            this.updateColumnCounts();
        }
    }

    updateColumnCounts() {
        const columns = {
            'todo': document.getElementById('todo-list'),
            'inProgress': document.getElementById('progress-list'),
            'done': document.getElementById('done-list')
        };

        Object.entries(columns).forEach(([status, list]) => {
            if (list) {
                const count = list.querySelectorAll('.task-card').length;
                const countElement = document.getElementById(`${status}-count`);
                if (countElement) {
                    countElement.textContent = count;
                }
            }
        });
    }

    // Инициализация после загрузки DOM
    init() {
        // Ждем пока все задачи загрузятся
        setTimeout(() => {
            this.updateColumnCounts();
        }, 1000);
    }
}

export const dragDropManager = new DragDropManager();