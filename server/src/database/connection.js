const { Pool } = require('pg');

console.log('🔧 Подключаюсь к PostgreSQL...');

// ИСПРАВЛЕНО: Используем переменные окружения для продакшена
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'task_tracker',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

// Проверка подключения
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
        console.log('💡 Проверьте настройки подключения:');
        console.log('   Host:', process.env.DB_HOST || 'localhost');
        console.log('   Port:', process.env.DB_PORT || 5432);
        console.log('   Database:', process.env.DB_NAME || 'task_tracker');
    } else {
        console.log('✅ PostgreSQL подключен:', res.rows[0].now);
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};