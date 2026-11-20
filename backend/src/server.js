require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and set it.');
  process.exit(1);
}

(async () => {
  try {
    await pool.query('SELECT 1'); // fail fast if the database is unreachable
    app.listen(PORT, () => console.log(`SCM API running on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Could not connect to the database:', err.message);
    process.exit(1);
  }
})();
