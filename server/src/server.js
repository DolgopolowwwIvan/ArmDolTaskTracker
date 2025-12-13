const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { initDatabase } = require('./database/models');
const initializeSocketHandlers = require('./socket-handlers/index');

const PORT = process.env.PORT || 3000;

// Инициализация базы данных
initDatabase();

const app = express();

// ИСПРАВЛЕНО: Настройка CORS для продакшена
const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['http://217.71.129.139', 'http://localhost'] 
    : '*';

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());

// Статические файлы клиента (если хотите раздавать их с сервера)
app.use(express.static(path.join(__dirname, '../../../client/dist')));

app.get('/', (req, res) => {
    res.json({
        message: 'Real-Time Task Tracker API',
        version: '1.0.0',
        status: 'running',
        websocket: `ws://${req.headers.host}`
    });
});

const server = http.createServer(app);

// ИСПРАВЛЕНО: Настройка Socket.IO для продакшена
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    },
    // Важно для работы за Nginx
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

io.on('connection', (socket) => {
    initializeSocketHandlers(io, socket);
});

// ИСПРАВЛЕНО: Слушаем на всех интерфейсах
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
    🚀 Сервер запущен!
    
    📍 Порт: ${PORT}
    🌐 WebSocket: ws://0.0.0.0:${PORT}
    🔗 HTTP: http://0.0.0.0:${PORT}
    🌍 Внешний IP: 217.71.129.139:5577
    
    📊 PostgreSQL: подключен
    👥 Реальная синхронизация
    ✅ Готов к работе!
    `);
});