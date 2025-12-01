/**
 * Конфигурационные константы
 */
module.exports = {
  PORT: process.env.PORT || 3000,
  
  // WebSocket события
  WS_EVENTS: {
    // Аутентификация
    REGISTER: 'user:register',
    LOGIN: 'user:login',
    
    // Задачи
    TASK_CREATE: 'task:create',
    TASK_UPDATE: 'task:update',
    TASK_COMPLETE: 'task:complete',
    TASK_SHARE: 'task:share',
    
    // Профиль
    PROFILE_VIEW: 'profile:view',
    
    // Системные
    SYNC_UPDATE: 'sync:update',
    ERROR: 'error'
  }
};
