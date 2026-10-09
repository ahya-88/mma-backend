const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');

function setupCronBackups() {
  // Menjalankan backup otomatis setiap jam 00:00 (tengah malam)
  cron.schedule('0 0 * * *', () => {
    console.log('[CRON] Memulai proses backup database harian...');
    const scriptPath = path.resolve(__dirname, '..', 'scripts', 'backup-database-json.js');
    const backupProcess = spawn('node', [scriptPath], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit'
    });

    backupProcess.on('close', (code) => {
      if (code === 0) {
        console.log('[CRON] Backup harian berhasil diselesaikan.');
      } else {
        console.error(`[CRON] Backup harian gagal dengan kode exit: ${code}`);
      }
    });
  });
  console.log('[CRON] Scheduler backup harian aktif (berjalan setiap jam 00:00).');
}

module.exports = setupCronBackups;
