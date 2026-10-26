import http from 'http';
import { app } from './app';
import { config } from './config';
import { pool } from './db';

const server = http.createServer(app);

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on 0.0.0.0:${config.PORT} [env=${config.NODE_ENV}]`);
});

// Graceful shutdown handler (strictly within 10 seconds per Cloud Run contract)
function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Draining connections and shutting down...`);

  const shutdownTimer = setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded (10s). Forcing termination.');
    process.exit(1);
  }, 10000);

  server.close(async (err) => {
    if (err) {
      console.error('Error during HTTP server close:', err);
      process.exit(1);
    }

    try {
      console.log('Closing PostgreSQL connection pool...');
      await pool.end();
      console.log('PostgreSQL pool closed cleanly.');
      clearTimeout(shutdownTimer);
      process.exit(0);
    } catch (dbErr) {
      console.error('Error while closing PostgreSQL pool:', dbErr);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
