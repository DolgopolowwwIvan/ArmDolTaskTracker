import { socketManager } from './socket.js';

class UIManager {
    constructor() {
        this.notificationContainer = null;
        this.init();
    }

    init() {
        this.createNotificationContainer();
        this.initModalListeners();
        this.setupSocketListeners();
    }

    createNotificationContainer() {
        this.notificationContainer = document.getElementById('notification-container');
        if (!this.notificationContainer) {
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'notification-container';
            document.body.appendChild(this.notificationContainer);
        }
    }

    initModalListeners() {
        // Закрытие модалок по клику на крестик
        document.querySelectorAll('.close-modal').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Закрытие модалок по клику вне контента
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Закрытие по ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });
    }

    setupSocketListeners() {
        socketManager.on('notification', (data) => {
            this.showNotification(data.message, data.type);
        });
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = this.getNotificationIcon(type);
        
        notification.innerHTML = `
            ${icon}
            <span>${this.escapeHtml(message)}</span>
        `;

        this.notificationContainer.appendChild(notification);

        // Автоматическое удаление через 5 секунд
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    getNotificationIcon(type) {
        const icons = {
            'success': '<i class="fas fa-check-circle"></i>',
            'error': '<i class="fas fa-exclamation-circle"></i>',
            'info': '<i class="fas fa-info-circle"></i>',
            'warning': '<i class="fas fa-exclamation-triangle"></i>'
        };
        return icons[type] || icons.info;
    }

    updateTaskCounts(tasks) {
        const counts = {
            todo: 0,
            done: 0
        };

        tasks.forEach(task => {
            if (task.status === 'done') {
                counts.done++;
            } else {
                counts.todo++; // todo и inProgress вместе
            }
        });

        // Обновляем счетчики в интерфейсе
        document.getElementById('todo-count').textContent = counts.todo;
        document.getElementById('done-count').textContent = counts.done;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Обновление онлайна
    updateOnlineCount(count) {
        const countEl = document.getElementById('online-count');
        if (countEl) {
            countEl.textContent = count || 1;
        }
    }

    // Показать/скрыть loader
    showLoader(show = true) {
        let loader = document.getElementById('global-loader');
        
        if (show && !loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.innerHTML = `
                <div class="loader-overlay">
                    <div class="loader-spinner"></div>
                </div>
            `;
            document.body.appendChild(loader);
            
            // Добавляем стили для loader
            const style = document.createElement('style');
            style.textContent = `
                .loader-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                }
                .loader-spinner {
                    width: 50px;
                    height: 50px;
                    border: 5px solid #f3f3f3;
                    border-top: 5px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        } else if (!show && loader) {
            loader.remove();
        }
    }
}

export const uiManager = new UIManager();

// Экспортируем функции для использования в других модулях
export function showNotification(message, type) {
    uiManager.showNotification(message, type);
}

export function updateTaskCounts(tasks) {
    uiManager.updateTaskCounts(tasks);
}