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

// Start server on 0.0.0.0 (accessible from all interfaces)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Pharmacy Bill Backend running on port ${PORT}`);
  console.log(`📌 Localhost: http://localhost:${PORT}/api/health`);
  console.log(`📱 Mobile/Network: http://${LOCAL_IP}:${PORT}/api/health`);
  console.log(`\n📡 Use this URL in your mobile app: http://${LOCAL_IP}:${PORT}`);
});
