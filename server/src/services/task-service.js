/**
 * Бизнес-логика задач
 */
const { Task, User } = require('../database/models');

class TaskService {
  // Создать задачу
  static async createTask(login, taskData) {
    console.log('🛠️ TaskService.createTask вызывается для:', login);
    console.log('📦 Данные задачи:', taskData);
    
    try {
        // Вариант 1: Ищем пользователя по логину (без пароля для упрощения)
        console.log('🔍 Ищем пользователя:', login);
        
        // Временно: получаем пользователя напрямую из базы
        const db = require('../database/connection');
        const userResult = await db.query(
            'SELECT id, login, tasks_completed FROM users WHERE login = $1',
            [login]
        );
        
        const user = userResult.rows[0];
        console.log('👤 Найден пользователь:', user);
        
        if (!user) {
            // Если не нашли, попробуем через User.login
            console.log('⚠️ Не найден напрямую, пробуем User.login...');
            try {
                const userFromLogin = await User.login(login, taskData.password);
                console.log('✅ Найден через User.login:', userFromLogin);
                user = userFromLogin;
            } catch (loginError) {
                console.error('❌ Ошибка User.login:', loginError.message);
                throw new Error(`Пользователь "${login}" не найден. Пароль: "${taskData.password}"`);
            }
        }
        
        if (!user) {
            throw new Error(`Пользователь "${login}" не существует в базе данных`);
        }
        
        // Создаем задачу
        console.log('📝 Создаем задачу для пользователя ID:', user.id);
        const task = await Task.create(
            taskData.title,
            taskData.description || '',
            user.id
        );
        
        console.log('✅ Задача создана успешно:', task.id);
        
        return {
            ...task,
            created_by_login: login
        };
        
    } catch (error) {
        console.error('💥 Критическая ошибка в createTask:', error);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

  // Поделиться задачей
  static async shareTask(taskId, ownerLogin, sharedLogins) {
    // Находим ID пользователей
    const userIds = [];
    for (const login of sharedLogins) {
      const user = await User.getProfile(login);
      if (user) {
        userIds.push(user.id);
      }
    }

    if (userIds.length > 0) {
      await Task.share(taskId, userIds);
    }

    return {
      taskId,
      sharedWith: sharedLogins,
      sharedCount: userIds.length
    };
  }

  // Выполнить задачу (частично)
  static async completeTask(taskId, login, password) {
    // Проверяем пользователя
    const user = await User.login(login, password);
    if (!user) throw new Error('Пользователь не найден');

    // Отмечаем выполнение
    const result = await Task.completeByUser(taskId, user.id);

    return {
      ...result,
      user_login: login
    };
  }

  // Получить профиль пользователя
  static async getProfile(login) {
    return await User.getProfile(login);
  }

  // Получить задачи пользователя
  static async getUserTasks(login, password) {
    const user = await User.login(login, password);
    if (!user) throw new Error('Пользователь не найден');

    const tasks = await Task.getUserTasks(user.id);
    const shared = await Task.getSharedTasks(user.id);

    return {
      user: {
        id: user.id,
        login: user.login,
        tasks_completed: user.tasks_completed
      },
      tasks,
      shared_tasks: shared
    };
  }
}

module.exports = TaskService;
