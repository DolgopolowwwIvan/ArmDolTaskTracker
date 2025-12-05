#!/bin/bash

echo "Создание упрощенной структуры Real-Time Task Tracker с PostgreSQL..."

# Создаем основную структуру
mkdir -p server/src/config
mkdir -p server/src/database
mkdir -p server/src/socket-handlers
mkdir -p server/src/services

# 1. Конфигурация
cat > server/src/config/constants.js << 'EOF'
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
EOF

# 2. Подключение к базе данных
cat > server/src/database/connection.js << 'EOF'
/**
 * Подключение к PostgreSQL
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'task_tracker',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Тестовое подключение
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Ошибка подключения к PostgreSQL:', err);
  } else {
    console.log('✅ PostgreSQL подключен:', res.rows[0].now);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
EOF

# 3. Модели базы данных
cat > server/src/database/models.js << 'EOF'
/**
 * Модели и SQL-запросы
 */
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

    console.log('✅ Таблицы созданы/проверены');
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
              COUNT(t.id) as total_tasks,
              COUNT(ut.task_id) as shared_tasks
       FROM users u
       LEFT JOIN tasks t ON t.created_by = u.id
       LEFT JOIN user_tasks ut ON ut.user_id = u.id
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
       RETURNING id, title, description, status, created_by, created_at`,
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
    const values = userIds.map(userId => `(${userId}, ${taskId})`).join(',');
    await db.query(
      `INSERT INTO user_tasks (user_id, task_id) 
       VALUES ${values} 
       ON CONFLICT (user_id, task_id) DO NOTHING`
    );
  },

  // Обновить статус задачи
  async updateStatus(taskId, status) {
    const result = await db.query(
      `UPDATE tasks 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, title, status, created_by`,
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
    if (total_users === completed_users) {
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

  // Получить задачи пользователя
  async getUserTasks(userId) {
    const result = await db.query(
      `SELECT t.*, 
              ut.completed as user_completed,
              COUNT(ut2.user_id) as total_participants,
              SUM(CASE WHEN ut2.completed THEN 1 ELSE 0 END) as completed_participants
       FROM tasks t
       JOIN user_tasks ut ON t.id = ut.task_id
       LEFT JOIN user_tasks ut2 ON t.id = ut2.task_id
       WHERE ut.user_id = $1
       GROUP BY t.id, ut.completed
       ORDER BY t.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  // Получить общие задачи (где несколько пользователей)
  async getSharedTasks(userId) {
    const result = await db.query(
      `SELECT t.*,
              COUNT(ut.user_id) as participant_count
       FROM tasks t
       JOIN user_tasks ut ON t.id = ut.task_id
       WHERE ut.user_id = $1
         AND t.id IN (
           SELECT task_id 
           FROM user_tasks 
           GROUP BY task_id 
           HAVING COUNT(user_id) > 1
         )
       GROUP BY t.id`,
      [userId]
    );
    return result.rows;
  }
};

module.exports = {
  initDatabase,
  User,
  Task
};
EOF

# 4. Сервис задач
cat > server/src/services/task-service.js << 'EOF'
/**
 * Бизнес-логика задач
 */
const { Task, User } = require('../database/models');

class TaskService {
  // Создать задачу
  static async createTask(login, taskData) {
    // Находим пользователя
    const user = await User.login(login, taskData.password);
    if (!user) throw new Error('Пользователь не найден');

    // Создаем задачу
    const task = await Task.create(
      taskData.title,
      taskData.description,
      user.id
    );

    return {
      ...task,
      created_by_login: login
    };
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
EOF

# 5. Обработчики WebSocket
cat > server/src/socket-handlers/index.js << 'EOF'
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
EOF

# 6. Главный серверный файл
cat > server/src/server.js << 'EOF'
/**
 * Главный файл сервера
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PORT } = require('./config/constants');
const { initDatabase } = require('./database/models');
const initializeSocketHandlers = require('./socket-handlers/index');

// Инициализация базы данных
initDatabase();

// Создание Express приложения
const app = express();
app.use(cors());
app.use(express.json());

// Простой маршрут для проверки
app.get('/', (req, res) => {
  res.json({
    message: 'Real-Time Task Tracker API',
    version: '1.0.0',
    features: [
      'WebSocket реального времени',
      'Простая регистрация/авторизация',
      'Общие задачи с разделением',
      'Мгновенные обновления'
    ]
  });
});

// Создание HTTP сервера
const server = http.createServer(app);

// Настройка Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Инициализация WebSocket обработчиков
io.on('connection', (socket) => {
  initializeSocketHandlers(io, socket);
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`
  🚀 Сервер запущен!
  
  📍 Порт: ${PORT}
  🌐 WebSocket: ws://localhost:${PORT}
  🔗 HTTP: http://localhost:${PORT}
  
  📊 PostgreSQL: хранилище задач
  👥 Реальная синхронизация
  ✅ Готов к работе!
  `);
});
EOF

# 7. package.json
cat > server/package.json << 'EOF'
{
  "name": "task-tracker-simple",
  "version": "1.0.0",
  "description": "Real-Time Task Tracker с PostgreSQL",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.4",
    "pg": "^8.11.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.3"
  },
  "keywords": [
    "realtime",
    "task-tracker",
    "websocket",
    "postgresql"
  ],
  "author": "",
  "license": "MIT"
}
EOF

# 8. .env.example
cat > server/.env.example << 'EOF'
# Конфигурация сервера
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=task_tracker
DB_USER=postgres
DB_PASSWORD=password

# Безопасность (упрощено)
JWT_SECRET=your-secret-key-change-in-production
EOF

# 9. Инструкции по запуску
cat > server/README.md << 'EOF'
# 🚀 Task Tracker - Backend

Real-Time трекер задач с мгновенной синхронизацией.

## 📋 Функционал

1. **Простая регистрация/авторизация** - логин/пароль
2. **Создание задач** - личные и общие
3. **Разделение задач** - несколько пользователей на одну задачу
4. **Прогресс выполнения** - каждый отмечает свою часть
5. **Профили пользователей** - статистика и задачи
6. **Real-time синхронизация** - все изменения видны сразу

## 🛠 Технологии

- Node.js + Express
- Socket.IO для real-time
- PostgreSQL для хранения
- Простая бизнес-логика

## 🚀 Быстрый старт

### 1. Установка PostgreSQL
```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# Mac
brew install postgresql

# Создать базу данных
sudo -u postgres psql
CREATE DATABASE task_tracker;
\q