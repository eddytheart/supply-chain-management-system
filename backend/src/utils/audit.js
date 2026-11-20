// Writes one row to audit_log. Every important action calls this (non-functional requirement: audit trail).
// Pass the connection `conn` when inside a transaction so the log commits or rolls back with the action.
const pool = require('../config/db');

async function logAction(userId, action, tableName, recordId = null, conn = null) {
  const executor = conn || pool;
  await executor.execute(
    'INSERT INTO audit_log (user_id, action, table_name, record_id) VALUES (?, ?, ?, ?)',
    [userId, action, tableName, recordId]
  );
}

module.exports = { logAction };
