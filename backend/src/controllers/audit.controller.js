// The administrator can read the audit trail (use case: View audit log).
const pool = require('../config/db');

async function listAudit(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const params = [];
    let where = '';
    if (req.query.action) {
      where = 'WHERE a.action = ?';
      params.push(String(req.query.action));
    }
    // LIMIT is a validated whole number, so it is safe to place directly in the query.
    const [rows] = await pool.execute(
      `SELECT a.log_id AS logId, a.action, a.table_name AS tableName, a.record_id AS recordId,
              a.logged_at AS loggedAt, u.full_name AS userName, u.username
       FROM audit_log a LEFT JOIN users u ON u.user_id = a.user_id
       ${where} ORDER BY a.log_id DESC LIMIT ${limit}`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { listAudit };
