const { Pool } = require('pg');

console.log('Подключаемся к локальному PostgreSQL...');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'task_tracker',
  user: 'postgres',
  password: 'postgres', 
});

// Проверка подключения
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Ошибка подключения к PostgreSQL:', err.message);
  } else {
    console.log('PostgreSQL подключен:', res.rows[0].now);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};