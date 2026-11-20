// Small read-only lists the front end needs for dropdowns.
const pool = require('../config/db');

async function listRoles(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT role_id AS roleId, role_name AS roleName FROM roles ORDER BY role_id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function listDepartments(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT department_id AS departmentId, department_name AS departmentName FROM departments ORDER BY department_name'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listRoles, listDepartments };
