/**
 * Бизнес-логика задач
 */
const db = require('../database/connection');
const { User, Task } = require('../database/models');

class TaskService {
  // Создать задачу
  static async createTask(login, taskData) {
    console.log('🛠️ TaskService.createTask вызывается для:', login);
    console.log('📦 Данные задачи:', taskData);
    
    try {
      // Находим пользователя
      const userResult = await db.query(
        'SELECT id, login, tasks_completed FROM users WHERE login = $1',
        [login]
      );
      
      const user = userResult.rows[0];
      
      if (!user) {
        throw new Error(`Пользователь "${login}" не найден`);
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
    console.log('🤝 TaskService.shareTask вызывается:');
    console.log('   Task ID:', taskId);
    console.log('   Owner:', ownerLogin);
    console.log('   Shared with:', sharedLogins);
    
    try {
      // Находим ID пользователей
      const userIds = [];
      for (const login of sharedLogins) {
        const userResult = await db.query(
          'SELECT id FROM users WHERE login = $1',
          [login]
        );
        
        if (userResult.rows[0]) {
          userIds.push(userResult.rows[0].id);
          console.log(`✅ Пользователь ${login} найден, ID: ${userResult.rows[0].id}`);
        } else {
          console.log(`⚠️ Пользователь ${login} не найден`);
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
    } catch (error) {
      console.error('💥 Ошибка в shareTask:', error);
      throw error;
    }
  }

  // Получить профиль пользователя
  static async getProfile(login) {
    try {
      return await User.getProfile(login);
    } catch (error) {
      console.error('💥 Ошибка в getProfile:', error);
      throw error;
    }
  }

  // Получить задачи пользователя
  static async getUserTasks(login, password) {
    try {
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
    } catch (error) {
      console.error('💥 Ошибка в getUserTasks:', error);
      throw error;
    }
  }

  // Удалить задачу
  static async deleteTask(taskId, login, password) {
    console.log('🗑️ TaskService.deleteTask вызывается:');
    console.log('   Task ID:', taskId);
    console.log('   Login:', login);
    
    try {
      // Находим пользователя
      const userResult = await db.query(
        'SELECT id FROM users WHERE login = $1',
        [login]
      );
      
      const user = userResult.rows[0];
      if (!user) {
        throw new Error(`Пользователь "${login}" не найден`);
      }
      
      console.log('👤 Пользователь найден, ID:', user.id);
      
      // Проверяем что задача существует и принадлежит пользователю
      const taskResult = await db.query(
        'SELECT * FROM tasks WHERE id = $1 AND created_by = $2',
        [taskId, user.id]
      );
      
      if (taskResult.rows.length === 0) {
        // ИЛИ задача может быть в user_tasks (общая задача)
        const sharedTaskResult = await db.query(
          'SELECT * FROM user_tasks WHERE task_id = $1 AND user_id = $2',
          [taskId, user.id]
        );
        
        if (sharedTaskResult.rows.length === 0) {
          throw new Error(`Задача ${taskId} не найдена или нет доступа`);
        }
      }
      
      // Удаляем из user_tasks
      await db.query(
        'DELETE FROM user_tasks WHERE task_id = $1',
        [taskId]
      );
      
      // Удаляем задачу (если создатель)
      const deleteResult = await db.query(
        'DELETE FROM tasks WHERE id = $1 RETURNING id',
        [taskId]
      );
      
      if (deleteResult.rowCount === 0) {
        throw new Error(`Задача ${taskId} не найдена`);
      }
      
      console.log('✅ Задача успешно удалена');
      return true;
      
    } catch (error) {
      console.error('💥 Ошибка в deleteTask:', error);
      throw error;
    }
  }

  // Выполнить задачу
  static async completeTask(taskId, login, password) {
    console.log('✅ TaskService.completeTask вызывается:');
    console.log('   Task ID:', taskId);
    console.log('   Login:', login);
    
    try {
      // Находим пользователя
      const userResult = await db.query(
        'SELECT id FROM users WHERE login = $1',
        [login]
      );
      
      const user = userResult.rows[0];
      if (!user) {
        throw new Error(`Пользователь "${login}" не найден`);
      }
      
      console.log('👤 Пользователь найден, ID:', user.id);
      
      // Проверяем существует ли задача
      const taskExists = await db.query(
        'SELECT id FROM tasks WHERE id = $1',
        [taskId]
      );
      
      if (taskExists.rows.length === 0) {
        throw new Error(`Задача ${taskId} не найдена`);
      }
      
      // Отмечаем выполнение пользователем
      await db.query(
        `INSERT INTO user_tasks (user_id, task_id, completed, completed_at) 
         VALUES ($1, $2, true, NOW())
         ON CONFLICT (user_id, task_id) 
         DO UPDATE SET completed = true, completed_at = NOW()`,
        [user.id, taskId]
      );
      
      console.log('✅ Пользователь отметил задачу как выполненную');
      
      // Проверяем, все ли выполнили задачу
      const result = await db.query(
        `SELECT 
            COUNT(*) as total_users,
            SUM(CASE WHEN completed THEN 1 ELSE 0 END) as completed_users
         FROM user_tasks 
         WHERE task_id = $1`,
        [taskId]
      );
      
      const { total_users, completed_users } = result.rows[0];
      const total = parseInt(total_users) || 0;
      const completed = parseInt(completed_users) || 0;
      
      console.log('📊 Статистика задачи:', { total, completed });
      
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      
      // Если все выполнили - задача завершена
      if (total === completed && total > 0) {
        console.log('🎯 Все выполнили задачу, отмечаем как done');
        await db.query(
          'UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2',
          ['done', taskId]
        );
        
        // Увеличиваем счетчики всем пользователям
        const users = await db.query(
          'SELECT user_id FROM user_tasks WHERE task_id = $1',
          [taskId]
        );
        
        for (const row of users.rows) {
          await db.query(
            'UPDATE users SET tasks_completed = tasks_completed + 1 WHERE id = $1',
            [row.user_id]
          );
        }
      }
      
      return {
        taskId,
        completed_users: completed,
        total_users: total,
        progress: progress
      };
      
    } catch (error) {
      console.error('💥 Ошибка в completeTask:', error);
      throw error;
    }
  }
}

module.exports = TaskService;