module.exports = {
  apps: [
    {
      name: 'opencode-proxy',
      script: 'dist/scripts/start-proxy.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'opencode-dashboard',
      script: 'npm',
      args: 'run preview',
      cwd: './dashboard',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
