/**
 * Обработчики WebSocket событий
 */
const TaskService = require('../services/task-service');
const { User } = require('../database/models');

// Храним подключенных пользователей
const connectedUsers = new Map(); // socket.id -> login

function initializeSocketHandlers(io, socket) {
  console.log(`Новое подключение: ${socket.id}`);

  // Регистрация - обработка события user:register
  socket.on('user:register', async (data, callback) => {
    try {
      console.log('📝 Событие регистрации:', data);
      const { login, password } = data;
      const user = await User.register(login, password);
      
      connectedUsers.set(socket.id, login);
      
      if (typeof callback === 'function') {
        callback({ success: true, user });
      }
      
      // Отправляем подтверждение аутентификации
      socket.emit('user:authenticated', { user });
      
      console.log(`✅ Зарегистрирован: ${login}`);
    } catch (error) {
      console.error('❌ Ошибка регистрации:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Вход - обработка события user:login
  socket.on('user:login', async (data, callback) => {
    try {
      console.log('🔐 Событие входа:', data);
      const { login, password } = data;
      const user = await User.login(login, password);
      
      if (user) {
        connectedUsers.set(socket.id, login);
        
        if (typeof callback === 'function') {
          callback({ success: true, user });
        }
        
        // Отправляем подтверждение аутентификации
        socket.emit('user:authenticated', { user });
        
        console.log(`✅ Вошел: ${login}`);
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Неверный логин или пароль' });
        }
      }
    } catch (error) {
      console.error('❌ Ошибка входа:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Создать задачу - обработка события task:create
  socket.on('task:create', async (data, callback) => {
    try {
      const userLogin = connectedUsers.get(socket.id);
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }

      console.log('📋 Создание задачи пользователем:', userLogin);
      console.log('📦 Данные задачи:', data);

      const task = await TaskService.createTask(userLogin, {
        ...data
      });

      // Отправляем всем обновление
      io.emit('sync:update', {
        type: 'task_created',
        task,
        user: userLogin
      });

      // Также отправляем конкретное событие о создании
      socket.emit('task:create', task);

      if (typeof callback === 'function') {
        callback({ success: true, task });
      }

      console.log(`✅ Задача создана: ${task.title} пользователем ${userLogin}`);
    } catch (error) {
      console.error('❌ Ошибка создания задачи:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
      socket.emit('error', error.message);
    }
  });

  // Поделиться задачей - обработка события task:share
  socket.on('task:share', async (data, callback) => {
    try {
      const userLogin = connectedUsers.get(socket.id);
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }

      console.log('🤝 Деление задачи:', data);

      const result = await TaskService.shareTask(
        data.taskId,
        userLogin,
        data.userLogins || []
      );

      // Отправляем уведомления всем участникам
      io.emit('sync:update', {
        type: 'task_shared',
        ...result,
        sharedBy: userLogin
      });

      if (typeof callback === 'function') {
        callback({ success: true, ...result });
      }

      console.log(`✅ Задача ${data.taskId} поделена`);
    } catch (error) {
      console.error('❌ Ошибка деления задачи:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Выполнить задачу - обработка события task:complete
  socket.on('task:complete', async (data, callback) => {
    try {
      console.log('✅ Сервер: Выполнение задачи...');
      console.log('📦 Данные:', data);
      
      // Получаем логин из connectedUsers
      const userLogin = connectedUsers.get(socket.id);
      console.log('👤 Пользователь из connectedUsers:', userLogin);
      
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }
      
      console.log('🛠️ Вызываем TaskService.completeTask...');
      const result = await TaskService.completeTask(
        data.taskId,
        userLogin,
        '123' // упрощенная схема
      );

      // Отправляем обновление прогресса всем
      io.emit('sync:update', {
        type: 'task_progress',
        ...result
      });

      // Также отправляем обновление конкретной задачи
      socket.emit('task:update', {
        id: data.taskId,
        progress: result.progress,
        status: result.progress === 100 ? 'done' : 'inProgress'
      });

      if (typeof callback === 'function') {
        callback({ success: true, ...result });
      }

      console.log(`✅ Прогресс задачи ${data.taskId}: ${result.progress}%`);
    } catch (error) {
      console.error('❌ Ошибка выполнения задачи:', error.message);
      console.error('Stack:', error.stack);
      
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Удалить задачу - обработка события task:delete
  socket.on('task:delete', async (data, callback) => {
    try {
      console.log('🗑️ Сервер: Удаление задачи...');
      console.log('📦 Данные:', data);
      
      // Получаем логин из connectedUsers
      const userLogin = connectedUsers.get(socket.id);
      console.log('👤 Пользователь:', userLogin);
      
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }
      
      console.log('🛠️ Вызываем TaskService.deleteTask...');
      const deleted = await TaskService.deleteTask(
        data.taskId,
        userLogin,
        '123' // упрощенная схема
      );

      // Уведомляем всех клиентов об удалении
      io.emit('sync:update', {
        type: 'task_deleted',
        taskId: data.taskId,
        deletedBy: userLogin
      });

      // Также отправляем конкретное событие
      socket.emit('task:delete', { taskId: data.taskId });

      if (typeof callback === 'function') {
        callback({ success: true, taskId: data.taskId });
      }

      console.log(`✅ Задача ${data.taskId} удалена пользователем ${userLogin}`);
    } catch (error) {
      console.error('❌ Ошибка удаления задачи:', error.message);
      console.error('Stack:', error.stack);
      
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Посмотреть профиль - обработка события profile:view
  socket.on('profile:view', async (data, callback) => {
    try {
      console.log('👤 Просмотр профиля:', data);
      const profile = await TaskService.getProfile(data.login);
      
      if (typeof callback === 'function') {
        callback({ success: true, profile });
      }
    } catch (error) {
      console.error('❌ Ошибка получения профиля:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Получить задачи пользователя - обработка события get_user_tasks
  socket.on('get_user_tasks', async (data, callback) => {
    try {
      const userLogin = connectedUsers.get(socket.id);
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }

      console.log('📋 Получение задач для:', userLogin);

      const result = await TaskService.getUserTasks(userLogin, '123');
      
      if (typeof callback === 'function') {
        callback({ success: true, ...result });
      }
    } catch (error) {
      console.error('❌ Ошибка получения задач:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Выход из системы
  socket.on('user:logout', async (data, callback) => {
    try {
      const userLogin = connectedUsers.get(socket.id);
      if (userLogin) {
        connectedUsers.delete(socket.id);
        console.log(`🚪 Выход: ${userLogin}`);
      }
      
      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error) {
      console.error('Ошибка выхода:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    const login = connectedUsers.get(socket.id);
    if (login) {
      console.log(`❌ Отключился: ${login}`);
      connectedUsers.delete(socket.id);
    } else {
      console.log(`❌ Отключился анонимный: ${socket.id}`);
    }
  });

  // Ping для тестирования
  socket.on('ping', (data, callback) => {
    console.log('🏓 Ping получен:', data);
    if (typeof callback === 'function') {
      callback({ success: true, message: 'pong', serverTime: Date.now() });
    }
  });
}

module.exports = initializeSocketHandlers;