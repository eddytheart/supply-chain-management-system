// FR3: the administrator creates, edits and deactivates users.
// Users are never deleted, only deactivated, so history stays intact.
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { logAction } = require('../utils/audit');

const USER_FIELDS = `u.user_id AS userId, u.full_name AS fullName, u.username, u.is_active AS isActive,
  u.created_at AS createdAt, r.role_id AS roleId, r.role_name AS role,
  d.department_id AS departmentId, d.department_name AS department`;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function listUsers(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT ${USER_FIELDS}
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.department_id = u.department_id
       ORDER BY u.full_name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { fullName, username, password, roleId, departmentId = null } = req.body || {};
    if (!fullName || !username || !password || !roleId) {
      throw badRequest('fullName, username, password and roleId are required.');
    }
    if (password.length < 8) throw badRequest('Password must be at least 8 characters.');

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, username, password_hash, role_id, department_id) VALUES (?, ?, ?, ?, ?)',
      [fullName, username, hash, roleId, departmentId]
    );
    await logAction(req.user.user_id, 'CREATE_USER', 'users', result.insertId);
    res.status(201).json({ userId: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { fullName, roleId, departmentId, password } = req.body || {};

    const fields = [];
    const values = [];
    if (fullName !== undefined) { fields.push('full_name = ?'); values.push(fullName); }
    if (roleId !== undefined) { fields.push('role_id = ?'); values.push(roleId); }
    if (departmentId !== undefined) { fields.push('department_id = ?'); values.push(departmentId); }
    if (password !== undefined) {
      if (password.length < 8) throw badRequest('Password must be at least 8 characters.');
      fields.push('password_hash = ?');
      values.push(await bcrypt.hash(password, 10));
    }
    if (fields.length === 0) throw badRequest('Nothing to update.');

    values.push(id);
    const [result] = await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE user_id = ?`, values);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found.' });

    await logAction(req.user.user_id, 'UPDATE_USER', 'users', id);
    res.json({ message: 'User updated.' });
  } catch (err) {
    next(err);
  }
}

async function setActive(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') throw badRequest('isActive must be true or false.');
    if (id === req.user.user_id && !isActive) {
      throw badRequest('You cannot deactivate your own account.');
    }
    const [result] = await pool.execute('UPDATE users SET is_active = ? WHERE user_id = ?', [isActive ? 1 : 0, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found.' });

    await logAction(req.user.user_id, isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'users', id);
    res.json({ message: isActive ? 'User activated.' : 'User deactivated.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, setActive };
