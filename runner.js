const { exec } = require('child_process');
const fs = require('fs');

exec('node index.js', (err, stdout, stderr) => {
    fs.writeFileSync('crash.log', stdout + '\n--- STDERR ---\n' + stderr, 'utf8');
    console.log("Crash log saved to crash.log");
});
