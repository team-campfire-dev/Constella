require('dotenv').config();
const { createTunnel } = require('tunnel-ssh');

const tunnelConfig = {
    active: process.env.NODE_ENV !== 'production',
    username: process.env.SSH_USER,
    host: process.env.SSH_HOST,
    port: parseInt(process.env.SSH_PORT || '22'),
    privateKey: require('fs').readFileSync(process.env.SSH_KEY_PATH),
    dstHost: process.env.DB_HOST,
    dstPort: parseInt(process.env.DB_PORT || '3306'),
    localPort: parseInt(process.env.DB_LOCAL_PORT || '3306'),
};

if (!tunnelConfig.active) {
    console.log('SSH Tunnel is disabled (NODE_ENV=production). Skipping...');
    process.exit(0);
}

const tunnelOptions = {
    autoClose: false
};

const serverOptions = {
    port: tunnelConfig.localPort
};

const sshOptions = {
    host: tunnelConfig.host,
    port: tunnelConfig.port,
    username: tunnelConfig.username,
    privateKey: tunnelConfig.privateKey
};

const forwardOptions = {
    dstAddr: tunnelConfig.dstHost,
    dstPort: tunnelConfig.dstPort
};

createTunnel(tunnelOptions, serverOptions, sshOptions, forwardOptions)
    .then(([server, conn]) => {
        console.log(`SSH Tunnel created: localhost:${tunnelConfig.localPort} -> ${tunnelConfig.dstHost}:${tunnelConfig.dstPort}`);
        server.on('error', (err) => {
            console.error('SSH Tunnel server error:', err);
        });
        conn.on('error', (err) => {
            console.error('SSH Tunnel connection error:', err);
        });
    })
    .catch((error) => {
        console.error('SSH Tunnel creation failed:', error);
        process.exit(1);
    });
