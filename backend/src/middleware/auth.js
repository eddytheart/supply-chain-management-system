// authenticate: checks the JWT sent in the Authorization header and loads the user.
// authorize: restricts a route to certain roles (FR2, role-based access control).
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const ROLES = {
  REQUESTER: 'Requester',
  STORE: 'Store Officer',
  PROCUREMENT: 'Procurement Officer',
  ADMIN: 'Administrator',
};

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Re-check the database so a deactivated user is locked out immediately.
    const [rows] = await pool.execute(
      `SELECT u.user_id, u.full_name, u.username, u.department_id, u.is_active, r.role_name
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = ?`,
      [payload.userId]
    );
    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ message: 'Account is inactive or does not exist.' });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({ message: 'You do not have permission to do this.' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, ROLES };
