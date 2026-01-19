require('dotenv').config();
const { createTunnel } = require('tunnel-ssh');

const tunnels = [
    {
        name: 'MySQL',
        username: process.env.SSH_USER,
        host: process.env.SSH_HOST,
        port: parseInt(process.env.SSH_PORT || '22'),
        privateKey: require('fs').readFileSync(process.env.SSH_KEY_PATH),
        dstHost: process.env.DB_HOST,
        dstPort: parseInt(process.env.DB_PORT || '3306'),
        localPort: parseInt(process.env.DB_LOCAL_PORT || '3307'),
    },
    {
        name: 'Neo4j',
        username: process.env.SSH_USER,
        host: process.env.SSH_HOST,
        port: parseInt(process.env.SSH_PORT || '22'),
        privateKey: require('fs').readFileSync(process.env.SSH_KEY_PATH),
        dstHost: process.env.NEO4J_HOST || 'localhost',
        dstPort: parseInt(process.env.NEO4J_PORT || '7687'),
        localPort: parseInt(process.env.NEO4J_LOCAL_PORT || '7687'),
    }
];

if (process.env.NODE_ENV === 'production') {
    console.log('SSH Tunnel is disabled (NODE_ENV=production). Skipping...');
    process.exit(0);
}

const startTunnel = (config) => {
    const tunnelOptions = { autoClose: false };
    const serverOptions = { port: config.localPort };
    const sshOptions = {
        host: config.host,
        port: config.port,
        username: config.username,
        privateKey: config.privateKey
    };
    const forwardOptions = {
        dstAddr: config.dstHost,
        dstPort: config.dstPort
    };

    return createTunnel(tunnelOptions, serverOptions, sshOptions, forwardOptions)
        .then(([server, conn]) => {
            console.log(`[${config.name}] SSH Tunnel created: localhost:${config.localPort} -> ${config.dstHost}:${config.dstPort}`);
            server.on('error', (err) => console.error(`[${config.name}] Server error:`, err));
            conn.on('error', (err) => console.error(`[${config.name}] Connection error:`, err));
            return { server, conn };
        });
};

Promise.all(tunnels.map(startTunnel))
    .then(() => console.log('All tunnels established successfully.'))
    .catch((error) => {
        console.error('Tunnel creation failed:', error);
        process.exit(1);
    });
