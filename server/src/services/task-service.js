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
