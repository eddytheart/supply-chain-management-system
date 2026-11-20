// Creates one sample user per role so the team can log in and test.
// Run once, after loading database/scm_database.sql:  npm run seed
// These passwords are for development only. Change them before any real use.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const SAMPLE_USERS = [
  { fullName: 'Sample Administrator',      username: 'admin',       role: 'Administrator',       dept: null,                             password: 'Admin@12345' },
  { fullName: 'Sample Procurement Officer', username: 'procurement', role: 'Procurement Officer', dept: null,                             password: 'Procure@12345' },
  { fullName: 'Sample Store Officer',      username: 'store',       role: 'Store Officer',       dept: null,                             password: 'Store@12345' },
  { fullName: 'Sample Requester',          username: 'requester',   role: 'Requester',           dept: 'Department of Computer Science', password: 'Request@12345' },
];

(async () => {
  try {
    for (const u of SAMPLE_USERS) {
      const [[role]] = await pool.execute('SELECT role_id FROM roles WHERE role_name = ?', [u.role]);
      let deptId = null;
      if (u.dept) {
        const [[dept]] = await pool.execute('SELECT department_id FROM departments WHERE department_name = ?', [u.dept]);
        deptId = dept.department_id;
      }
      const hash = await bcrypt.hash(u.password, 10);
      await pool.execute(
        `INSERT INTO users (full_name, username, password_hash, role_id, department_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name)`,
        [u.fullName, u.username, hash, role.role_id, deptId]
      );
      console.log(`Seeded ${u.role}: ${u.username}`);
    }
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
