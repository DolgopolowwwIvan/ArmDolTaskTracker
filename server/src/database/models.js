// Модели и SQL-запросы

const db = require('./connection');

// Создание таблиц (выполнить один раз при первом запуске)
async function initDatabase() {
  try {
    // Таблица пользователей
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        login VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        tasks_completed INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Таблица задач
    await db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'todo',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Таблица связи пользователей и задач (для общих задач)
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_tasks (
        user_id INTEGER REFERENCES users(id),
        task_id INTEGER REFERENCES tasks(id),
        completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP,
        PRIMARY KEY (user_id, task_id)
      )
    `);

    console.log('Таблицы созданы/проверены');
  } catch (error) {
    console.error('Ошибка создания таблиц:', error);
  }
}

// Функции для работы с пользователями
const User = {
  // Регистрация
  async register(login, password) {
    const result = await db.query(
      'INSERT INTO users (login, password) VALUES ($1, $2) RETURNING id, login, tasks_completed',
      [login, password]
    );
    return result.rows[0];
  },

  // Авторизация
  async login(login, password) {
    const result = await db.query(
      'SELECT id, login, tasks_completed FROM users WHERE login = $1 AND password = $2',
      [login, password]
    );
    return result.rows[0];
  },

  // Получить профиль по логину
  async getProfile(login) {
    const result = await db.query(
      `SELECT u.id, u.login, u.tasks_completed,
              COUNT(DISTINCT t.id) as total_tasks,
              COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END) as completed_tasks,
              COUNT(DISTINCT CASE WHEN ut2.user_id IS NOT NULL THEN ut2.task_id END) as shared_tasks
       FROM users u
       LEFT JOIN tasks t ON t.created_by = u.id
       LEFT JOIN user_tasks ut ON ut.user_id = u.id
       LEFT JOIN user_tasks ut2 ON ut2.task_id = t.id AND ut2.user_id != u.id
       WHERE u.login = $1
       GROUP BY u.id`,
      [login]
    );
    return result.rows[0];
  },

  // Обновить счетчик выполненных задач
  async incrementTasksCompleted(userId) {
    await db.query(
      'UPDATE users SET tasks_completed = tasks_completed + 1 WHERE id = $1',
      [userId]
    );
  }
};

// Функции для работы с задачами
const Task = {
  // Создать задачу
  async create(title, description, createdBy) {
    const result = await db.query(
      `INSERT INTO tasks (title, description, created_by) 
       VALUES ($1, $2, $3) 
       RETURNING id, title, description, status, created_by, created_at, updated_at`,
      [title, description, createdBy]
    );
    
    // Добавляем создателя в таблицу связей
    const task = result.rows[0];
    await db.query(
      'INSERT INTO user_tasks (user_id, task_id) VALUES ($1, $2)',
      [createdBy, task.id]
    );
    
    return task;
  },

  // Поделиться задачей с пользователями
  async share(taskId, userIds) {
    for (const userId of userIds) {
      try {
        await db.query(
          `INSERT INTO user_tasks (user_id, task_id) 
           VALUES ($1, $2) 
           ON CONFLICT (user_id, task_id) DO NOTHING`,
          [userId, taskId]
        );
      } catch (error) {
        console.error(`Ошибка добавления пользователя ${userId} к задаче ${taskId}:`, error);
      }
    }
  },

  // Обновить статус задачи
  async updateStatus(taskId, status) {
    const result = await db.query(
      `UPDATE tasks 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, title, status, created_by, created_at, updated_at`,
      [status, taskId]
    );
    return result.rows[0];
  },

  // Отметить выполнение пользователем
  async completeByUser(taskId, userId) {
    await db.query(
      `UPDATE user_tasks 
       SET completed = TRUE, completed_at = NOW() 
       WHERE task_id = $1 AND user_id = $2`,
      [taskId, userId]
    );

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
    
    // Если все выполнили - задача завершена
    if (total_users === completed_users && total_users > 0) {
      await this.updateStatus(taskId, 'done');
      
      // Увеличиваем счетчики всем пользователям
      const users = await db.query(
        'SELECT user_id FROM user_tasks WHERE task_id = $1',
        [taskId]
      );
      
      for (const row of users.rows) {
        await User.incrementTasksCompleted(row.user_id);
      }
    }

    return {
      taskId,
      completed_users: parseInt(completed_users),
      total_users: parseInt(total_users),
      progress: Math.round((completed_users / total_users) * 100)
    };
  },

  // Получить задачи пользователя с прогрессом
  async getUserTasks(userId) {
    const result = await db.query(
      `SELECT t.*, 
              u.login as created_by_login,
              COUNT(ut2.user_id) as total_participants,
              SUM(CASE WHEN ut2.completed THEN 1 ELSE 0 END) as completed_participants,
              ut.completed as user_completed
       FROM tasks t
       JOIN user_tasks ut ON t.id = ut.task_id
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN user_tasks ut2 ON t.id = ut2.task_id
       WHERE ut.user_id = $1
       GROUP BY t.id, u.login, ut.completed
       ORDER BY t.created_at DESC`,
      [userId]
    );
    
    return result.rows.map(row => {
      // Рассчитываем прогресс
      let progress = 0;
      if (row.status === 'done') {
        progress = 100;
      } else if (row.total_participants > 0) {
        progress = Math.round((row.completed_participants / row.total_participants) * 100);
      }
      
      return {
        ...row,
        progress: progress
      };
    });
  },

  // Получить общие задачи (где несколько пользователей)
  async getSharedTasks(userId) {
    const result = await db.query(
      `SELECT t.*,
              u.login as created_by_login,
              COUNT(ut.user_id) as participant_count
       FROM tasks t
       JOIN user_tasks ut ON t.id = ut.task_id
       LEFT JOIN users u ON t.created_by = u.id
       WHERE ut.user_id = $1
         AND t.id IN (
           SELECT task_id 
           FROM user_tasks 
           GROUP BY task_id 
           HAVING COUNT(user_id) > 1
         )
       GROUP BY t.id, u.login`,
      [userId]
    );
    
    return result.rows.map(row => {
      // Рассчитываем прогресс для shared задач
      let progress = 0;
      if (row.status === 'done') {
        progress = 100;
      }
      
      return {
        ...row,
        progress: progress
      };
    });
  }
};

module.exports = {
  initDatabase,
  User,
  Task
};