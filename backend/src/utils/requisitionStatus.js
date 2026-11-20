// The ONE place that decides how a requisition may move between statuses.
// Later modules (purchase orders, stock issue) call changeStatus() too, so nobody can skip a step.
//
//   submitted -> approved | rejected
//   approved  -> ordered  (stock not enough, a purchase order is raised)
//   approved  -> delivered (fulfilled straight from stock)
//   ordered   -> delivered (goods received and issued)
//   delivered -> closed
//   rejected and closed are final.
const { httpError } = require('./httpError');
const { logAction } = require('./audit');

const TRANSITIONS = {
  submitted: ['approved', 'rejected'],
  approved: ['ordered', 'delivered'],
  ordered: ['delivered'],
  delivered: ['closed'],
  rejected: [],
  closed: [],
};

// Must be called with a connection that is inside a transaction (see withTransaction).
async function changeStatus(conn, requisitionId, newStatus, userId, comment = null) {
  // FOR UPDATE locks the row, so two people cannot change the same requisition at the same instant.
  const [rows] = await conn.execute(
    'SELECT status FROM requisitions WHERE requisition_id = ? FOR UPDATE',
    [requisitionId]
  );
  if (rows.length === 0) throw httpError(404, 'Requisition not found.');

  const current = rows[0].status;
  if (!TRANSITIONS[current] || !TRANSITIONS[current].includes(newStatus)) {
    throw httpError(409, `A requisition that is "${current}" cannot be changed to "${newStatus}".`);
  }

  await conn.execute('UPDATE requisitions SET status = ? WHERE requisition_id = ?', [newStatus, requisitionId]);
  await conn.execute(
    'INSERT INTO requisition_status_history (requisition_id, status, changed_by, comment) VALUES (?, ?, ?, ?)',
    [requisitionId, newStatus, userId, comment]
  );
  await logAction(userId, `REQUISITION_${newStatus.toUpperCase()}`, 'requisitions', requisitionId, conn);

  return { from: current, to: newStatus };
}

module.exports = { changeStatus, TRANSITIONS };
