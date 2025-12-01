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
