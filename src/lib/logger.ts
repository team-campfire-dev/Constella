import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'constella-service' },
    transports: [
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production'
                ? winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
                : winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                ),
        }),
    ],
});

export default logger;
