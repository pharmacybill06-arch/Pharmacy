// Database configuration file (reserved for future advanced configurations)
// Currently, database is configured via DATABASE_URL in .env
// This file can be extended for connection pooling, SSL options, etc.

module.exports = {
  // Development config
  development: {
    logging: true,
    enableQueryLogging: true
  },
  
  // Production config
  production: {
    logging: false,
    enableQueryLogging: false
  }
};
