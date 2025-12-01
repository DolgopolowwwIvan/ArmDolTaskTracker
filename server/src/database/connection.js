const { Pool } = require('pg');

console.log('🔧 Подключаюсь к локальному PostgreSQL...');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'task_tracker',
  user: 'postgres',
  password: 'postgres', 
});

// Простая проверка подключения
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
    console.log('💡 Проверьте что:');
    console.log('   1. PostgreSQL запущен: sudo systemctl status postgresql');
    console.log('   2. База существует: sudo -u postgres psql -c "\\l"');
    console.log('   3. Можно подключиться: psql -h localhost -p 5432 -U postgres -d task_tracker');
  } else {
    console.log('✅ PostgreSQL подключен:', res.rows[0].now);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};