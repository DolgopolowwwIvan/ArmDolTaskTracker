module.exports = {
    apps: [{
        name: 'task-tracker-server',
        script: './server/src/server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production',
            PORT: 3000,
            DB_HOST: 'localhost',
            DB_PORT: 5432,
            DB_NAME: 'task_tracker',
            DB_USER: 'postgres',
            DB_PASSWORD: 'postgres'
        }
    }]
};