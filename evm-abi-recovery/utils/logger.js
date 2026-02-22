const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'app.log');

function formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
}

const logger = {
    info: (msg) => {
        const line = formatMessage('info', msg);
        console.log(`\x1b[36m${line}\x1b[0m`);
        fs.appendFileSync(logFile, line + '\n');
    },
    success: (msg) => {
        const line = formatMessage('success', msg);
        console.log(`\x1b[32m${line}\x1b[0m`);
        fs.appendFileSync(logFile, line + '\n');
    },
    warn: (msg) => {
        const line = formatMessage('warn', msg);
        console.warn(`\x1b[33m${line}\x1b[0m`);
        fs.appendFileSync(logFile, line + '\n');
    },
    error: (msg) => {
        const line = formatMessage('error', msg);
        console.error(`\x1b[31m${line}\x1b[0m`);
        fs.appendFileSync(logFile, line + '\n');
    }
};

module.exports = logger;
