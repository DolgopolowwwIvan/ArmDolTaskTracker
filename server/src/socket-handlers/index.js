/**
 * Обработчики WebSocket событий
 */
const TaskService = require('../services/task-service');
const { User } = require('../database/models');
const db = require('../database/connection');

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

  // Восстановление сессии
  socket.on('user:restore', async (data, callback) => {
    try {
      console.log('🔄 Восстановление сессии:', data);
      const { login } = data;
      const user = await User.getProfile(login);
      
      if (user) {
        connectedUsers.set(socket.id, login);
        
        if (typeof callback === 'function') {
          callback({ success: true, user });
        }
        
        // Отправляем подтверждение
        socket.emit('user:restored', { user });
        
        console.log(`✅ Сессия восстановлена для: ${login}`);
      } else {
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Пользователь не найден' });
        }
      }
    } catch (error) {
      console.error('❌ Ошибка восстановления сессии:', error.message);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

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
        
        // УБРАЛИ уведомление от сервера
        // socket.emit('notification', { message: `Задача "${task.title}" создана`, type: 'success' });
        
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

  // В обработчике task:complete убрать уведомление:

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
        if (result.task) {
            io.emit('task:update', result.task);
            socket.emit('task:update', result.task);
        }

        if (typeof callback === 'function') {
            callback({ success: true, ...result });
        }

        console.log(`✅ Прогресс задачи ${data.taskId}: ${result.progress}%`);
        
        // УБРАЛИ уведомление от сервера
        // socket.emit('notification', { message: `Прогресс задачи: ${result.progress}%`, type: 'info' });
        
    } catch (error) {
        console.error('❌ Ошибка выполнения задачи:', error.message);
        console.error('Stack:', error.stack);
        
        if (typeof callback === 'function') {
            callback({ success: false, error: error.message });
        }
    }
});

  // В обработчике task:delete убрать уведомление:

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
        
        // УБРАЛИ уведомление от сервера
        // socket.emit('notification', { message: 'Задача удалена', type: 'info' });
        
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
      const userLogin = connectedUsers.get(socket.id) || data.login;
      if (!userLogin) {
        throw new Error('Требуется авторизация');
      }

      console.log('📋 Получение задач для:', userLogin);

      // Находим пользователя
      const userResult = await db.query(
        'SELECT id, login, tasks_completed FROM users WHERE login = $1',
        [userLogin]
      );
      
      const user = userResult.rows[0];
      if (!user) {
        throw new Error('Пользователь не найден');
      }

      // Получаем задачи пользователя из базы с прогрессом
      const tasksResult = await db.query(
        `SELECT t.*, u.login as created_by_login,
                COUNT(ut2.user_id) as total_participants,
                SUM(CASE WHEN ut2.completed THEN 1 ELSE 0 END) as completed_participants
         FROM tasks t
         LEFT JOIN user_tasks ut ON t.id = ut.task_id
         LEFT JOIN users u ON t.created_by = u.id
         LEFT JOIN user_tasks ut2 ON t.id = ut2.task_id
         WHERE ut.user_id = $1 OR t.created_by = $1
         GROUP BY t.id, u.login
         ORDER BY t.created_at DESC`,
        [user.id]
      );

      const tasks = tasksResult.rows.map(task => {
        // Рассчитываем прогресс
        let progress = 0;
        if (task.status === 'done') {
          progress = 100;
        } else if (task.total_participants > 0) {
          progress = Math.round((task.completed_participants / task.total_participants) * 100);
        }
        
        return {
          ...task,
          progress: progress,
          status: task.status || 'todo'
        };
      });

      if (typeof callback === 'function') {
        callback({ 
          success: true, 
          tasks,
          user: {
            id: user.id,
            login: user.login,
            tasks_completed: user.tasks_completed
          }
        });
      }

      console.log(`✅ Загружено ${tasks.length} задач для ${userLogin}`);

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