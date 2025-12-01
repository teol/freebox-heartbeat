module.exports = {
    apps: [
        {
            name: 'freebox-heartbeat',
            script: './dist/monitor.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '200M',
            node_args: '--enable-source-maps',
            env: {
                NODE_ENV: 'production'
            },
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            restart_delay: 4000,
            min_uptime: '10s',
            max_restarts: 10,
            kill_timeout: 5000,
            wait_ready: false,
            listen_timeout: 3000
        }
    ]
};
