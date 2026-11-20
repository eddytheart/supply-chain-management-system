// FR1: users log in with a username and password (passwords are stored hashed).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { logAction } = require('../utils/audit');

async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const [rows] = await pool.execute(
      `SELECT u.user_id, u.full_name, u.username, u.password_hash, u.department_id, u.is_active, r.role_name
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.username = ?`,
      [username]
    );
    const user = rows[0];

    // Same message for "no such user" and "wrong password" so attackers cannot discover usernames.
    const invalid = () => res.status(401).json({ message: 'Invalid username or password.' });

    if (!user) return invalid();
    if (!user.is_active) return res.status(403).json({ message: 'This account has been deactivated.' });

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      await logAction(user.user_id, 'LOGIN_FAILED', 'users', user.user_id);
      return invalid();
    }

    const token = jwt.sign({ userId: user.user_id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });
    await logAction(user.user_id, 'LOGIN', 'users', user.user_id);

    res.json({
      token,
      user: {
        userId: user.user_id,
        fullName: user.full_name,
        username: user.username,
        role: user.role_name,
        departmentId: user.department_id,
      },
    });
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  const u = req.user;
  res.json({
    userId: u.user_id,
    fullName: u.full_name,
    username: u.username,
    role: u.role_name,
    departmentId: u.department_id,
  });
}

module.exports = { login, me };
