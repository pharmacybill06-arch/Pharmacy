const app = require('./app');
const path = require('path');
const os = require('os');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Get port from environment or use default
const PORT = process.env.PORT || 5000;

// Get local IP address for mobile access
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();

// Kill any existing process on the port (Windows only) before starting
async function killPortProcess(port) {
  if (process.platform !== 'win32') return false;
  const { execSync } = require('child_process');
  try {
    const result = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen' | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
      { timeout: 5000 }
    );
    return true;
  } catch (e) {
    return false;
  }
}

// Start server on 0.0.0.0 (accessible from all interfaces)
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Pharmacy Bill Backend running on port ${PORT}`);
  console.log(`📌 Localhost: http://localhost:${PORT}/api/health`);
  console.log(`📱 Mobile/Network: http://${LOCAL_IP}:${PORT}/api/health`);
  console.log(`\n📡 Use this URL in your mobile app: http://${LOCAL_IP}:${PORT}`);
});

// Handle port already in use - kill old process and retry ONCE
let retried = false;
server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE' && !retried) {
    retried = true;
    console.error(`⚠️  Port ${PORT} is already in use. Killing old process and retrying...`);
    await killPortProcess(PORT);
    setTimeout(() => {
      server.listen(PORT, '0.0.0.0');
    }, 2000);
  } else if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is still in use after retry. Run this to free it:`);
    console.error(`   Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT} | Where-Object State -eq 'Listen' | Select-Object -First 1 -ExpandProperty OwningProcess) -Force`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
