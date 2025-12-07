// config.js
export const CONFIG = {
    // ⚠️ Ваш внешний адрес
    SERVER_URL: 'http://217.71.129.139:5958',
    
    // Альтернативные URL для тестирования
    ALTERNATE_URLS: [
        'http://217.71.129.139:5958',
        'ws://217.71.129.139:5958',
        'http://172.17.4.243:8080',  // Ваш внутренний IP
        'http://localhost:8080'
    ],
    
    // Настройки подключения
    SOCKET_OPTIONS: {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        forceNew: true,
        path: '/socket.io/'
    },
    
    // Настройки приложения
    APP: {
        name: 'ArmDol Task Tracker',
        version: '1.0.0',
        debug: true
    }
};

// Функция для тестирования подключения
export async function testConnection(url) {
    try {
        const response = await fetch(`${url}/`);
        return response.ok;
    } catch (error) {
        console.error('❌ Ошибка тестирования подключения:', error);
        return false;
    }
}