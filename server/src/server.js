const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Импорт
const { initDatabase } = require('./database/models');
const initializeSocketHandlers = require('./socket-handlers/index');

const PORT = process.env.PORT || 8080;

// Инициализация базы данных
initDatabase();

// Создание Express
const app = express();
app.use(cors());
app.use(express.json());

// Обслуживание статики из public
app.use(express.static(path.join(__dirname, '../../public')));

app.get('/', (req, res) => {
  // Если клиент запрашивает HTML - отдаем index.html
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  } else {
    // Иначе отдаем JSON API
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
  }
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 Сервер запущен!
  
  📍 Порт: ${PORT}
  🌐 WebSocket: ws://localhost:${PORT}
  🔗 HTTP: http://localhost:${PORT}
  🌍 Внешний адрес: ws://217.71.129.139:5958
  🔗 HTTP внешний: http://217.71.129.139:5958
  
  📊 PostgreSQL: хранилище задач
  👥 Реальная синхронизация
  ✅ Готов к работе!
  `);
});