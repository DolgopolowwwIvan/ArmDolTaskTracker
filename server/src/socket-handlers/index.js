/**
 * Обработчики WebSocket событий
 */
const TaskService = require('../services/task-service');
const { WS_EVENTS } = require('../config/constants');
const { User } = require('../database/models');

// Храним подключенных пользователей
const connectedUsers = new Map(); // socket.id -> login

function initializeSocketHandlers(io, socket) {
  console.log(`Новое подключение: ${socket.id}`);

  // Регистрация
  socket.on(WS_EVENTS.REGISTER, async (data, callback) => {
    try {
      const { login, password } = data;
      const user = await User.register(login, password);
      
      connectedUsers.set(socket.id, login);
      
      if (typeof callback === 'function') {
        callback({ success: true, user });
      }
      
      console.log(`Зарегистрирован: ${login}`);
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Вход
  socket.on(WS_EVENTS.LOGIN, async (data, callback) => {
    try {
      const { login, password } = data;
      const user = await User.login(login, password);
      
      if (user) {
        connectedUsers.set(socket.id, login);
        
        if (typeof callback === 'function') {
          callback({ success: true, user });
        }
        
        console.log(`Вошел: ${login}`);
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Неверный логин или пароль' });
        }
      }
    } catch (error) {
      console.error('Ошибка входа:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Создать задачу
  socket.on(WS_EVENTS.TASK_CREATE, async (data, callback) => {
    try {
      const userLogin = connectedUsers.get(socket.id);
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }

      const task = await TaskService.createTask(userLogin, {
        ...data,
        password: data.password // упрощенная проверка
      });

      // Отправляем всем обновление
      io.emit(WS_EVENTS.SYNC_UPDATE, {
        type: 'task_created',
        task,
        user: userLogin
      });

      if (typeof callback === 'function') {
        callback({ success: true, task });
      }

      console.log(`Задача создана: ${task.title} пользователем ${userLogin}`);
    } catch (error) {
      console.error('Ошибка создания задачи:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
      socket.emit(WS_EVENTS.ERROR, error.message);
    }
  });

  // Поделиться задачей
  socket.on(WS_EVENTS.TASK_SHARE, async (data, callback) => {
    try {
      const userLogin = connectedUsers.get(socket.id);
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }

      const result = await TaskService.shareTask(
        data.taskId,
        userLogin,
        data.userLogins
      );

      // Отправляем уведомления всем участникам
      io.emit(WS_EVENTS.SYNC_UPDATE, {
        type: 'task_shared',
        ...result,
        sharedBy: userLogin
      });

      if (typeof callback === 'function') {
        callback({ success: true, ...result });
      }

      console.log(`Задача ${data.taskId} поделена с ${data.userLogins.length} пользователями`);
    } catch (error) {
      console.error('Ошибка деления задачи:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Выполнить задачу
  socket.on(WS_EVENTS.TASK_COMPLETE, async (data, callback) => {
    try {
      const userLogin = connectedUsers.get(socket.id);
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }

      const result = await TaskService.completeTask(
        data.taskId,
        userLogin,
        data.password
      );

      // Отправляем обновление прогресса всем
      io.emit(WS_EVENTS.SYNC_UPDATE, {
        type: 'task_progress',
        ...result
      });

      // Если задача полностью завершена
      if (result.progress === 100) {
        io.emit(WS_EVENTS.SYNC_UPDATE, {
          type: 'task_completed',
          taskId: data.taskId
        });
      }

      if (typeof callback === 'function') {
        callback({ success: true, ...result });
      }

      console.log(`Прогресс задачи ${data.taskId}: ${result.progress}%`);
    } catch (error) {
      console.error('Ошибка выполнения задачи:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Посмотреть профиль
  socket.on(WS_EVENTS.PROFILE_VIEW, async (data, callback) => {
    try {
      const profile = await TaskService.getProfile(data.login);
      
      if (typeof callback === 'function') {
        callback({ success: true, profile });
      }
    } catch (error) {
      console.error('Ошибка получения профиля:', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    const login = connectedUsers.get(socket.id);
    if (login) {
      console.log(`Отключился: ${login}`);
      connectedUsers.delete(socket.id);
    } else {
      console.log(`Отключился анонимный: ${socket.id}`);
    }
  });
}

module.exports = initializeSocketHandlers;
