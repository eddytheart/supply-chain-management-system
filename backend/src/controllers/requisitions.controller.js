// FR4: a requester creates a requisition.
// FR5: a requester sees the status and history of their requisitions.
// FR6: the procurement officer approves or rejects a requisition, with a comment.
const pool = require('../config/db');
const { ROLES } = require('../middleware/auth');
const { httpError } = require('../utils/httpError');
const { withTransaction } = require('../utils/transaction');
const { logAction } = require('../utils/audit');
const { changeStatus } = require('../utils/requisitionStatus');

const STATUSES = ['submitted', 'approved', 'rejected', 'ordered', 'delivered', 'closed'];

// ---------- FR4: create ----------
async function createRequisition(req, res, next) {
  try {
    const { reason = null, items } = req.body || {};

    if (!req.user.department_id) {
      throw httpError(400, 'Your account has no department. Ask the administrator to assign one.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw httpError(400, 'Add at least one item to the requisition.');
    }

    const seen = new Set();
    for (const line of items) {
      if (!Number.isInteger(line.itemId) || !Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw httpError(400, 'Each item needs a valid itemId and a whole-number quantity above zero.');
      }
      if (seen.has(line.itemId)) {
        throw httpError(400, 'The same item appears more than once. Combine the quantities.');
      }
      seen.add(line.itemId);
    }

    const requisitionId = await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        'INSERT INTO requisitions (requested_by, department_id, reason, status) VALUES (?, ?, ?, ?)',
        [req.user.user_id, req.user.department_id, reason, 'submitted']
      );
      const id = result.insertId;

      for (const line of items) {
        await conn.execute(
          'INSERT INTO requisition_items (requisition_id, item_id, quantity_requested) VALUES (?, ?, ?)',
          [id, line.itemId, line.quantity]
        );
      }
      await conn.execute(
        'INSERT INTO requisition_status_history (requisition_id, status, changed_by, comment) VALUES (?, ?, ?, ?)',
        [id, 'submitted', req.user.user_id, null]
      );
      await logAction(req.user.user_id, 'REQUISITION_SUBMITTED', 'requisitions', id, conn);
      return id;
    });

    res.status(201).json({ requisitionId, status: 'submitted' });
  } catch (err) {
    next(err);
  }
}

// ---------- FR5: list ----------
// Requesters see only their own requisitions. Store, procurement and admin staff see all.
async function listRequisitions(req, res, next) {
  try {
    const { status } = req.query;
    if (status && !STATUSES.includes(status)) throw httpError(400, 'Unknown status filter.');

    const where = [];
    const params = [];
    if (req.user.role_name === ROLES.REQUESTER) {
      where.push('r.requested_by = ?');
      params.push(req.user.user_id);
    }
    if (status) {
      where.push('r.status = ?');
      params.push(status);
    }

    const [rows] = await pool.execute(
      `SELECT r.requisition_id AS requisitionId, r.status, r.reason, r.created_at AS createdAt,
              u.full_name AS requestedBy, d.department_name AS department,
              (SELECT COUNT(*) FROM requisition_items ri WHERE ri.requisition_id = r.requisition_id) AS itemCount
       FROM requisitions r
       JOIN users u ON u.user_id = r.requested_by
       JOIN departments d ON d.department_id = r.department_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY r.created_at DESC, r.requisition_id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// ---------- FR5: detail with items and full history ----------
async function getRequisition(req, res, next) {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.execute(
      `SELECT r.requisition_id AS requisitionId, r.status, r.reason, r.created_at AS createdAt,
              r.requested_by AS requestedById, u.full_name AS requestedBy, d.department_name AS department
       FROM requisitions r
       JOIN users u ON u.user_id = r.requested_by
       JOIN departments d ON d.department_id = r.department_id
       WHERE r.requisition_id = ?`,
      [id]
    );
    if (rows.length === 0) throw httpError(404, 'Requisition not found.');
    const requisition = rows[0];

    if (req.user.role_name === ROLES.REQUESTER && requisition.requestedById !== req.user.user_id) {
      throw httpError(403, 'You can only view your own requisitions.');
    }

    const [items] = await pool.execute(
      `SELECT i.item_id AS itemId, i.item_name AS itemName, i.unit, ri.quantity_requested AS quantityRequested
       FROM requisition_items ri JOIN items i ON i.item_id = ri.item_id
       WHERE ri.requisition_id = ? ORDER BY i.item_name`,
      [id]
    );
    const [history] = await pool.execute(
      `SELECT h.status, u.full_name AS changedBy, h.changed_at AS changedAt, h.comment
       FROM requisition_status_history h JOIN users u ON u.user_id = h.changed_by
       WHERE h.requisition_id = ? ORDER BY h.changed_at, h.history_id`,
      [id]
    );

    res.json({ ...requisition, items, history });
  } catch (err) {
    next(err);
  }
}

// ---------- FR6: approve or reject ----------
async function decide(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { decision, comment } = req.body || {};

    if (!['approved', 'rejected'].includes(decision)) {
      throw httpError(400, 'decision must be "approved" or "rejected".');
    }
    if (decision === 'rejected' && (!comment || !comment.trim())) {
      throw httpError(400, 'Please give a reason when rejecting a requisition.');
    }

    const result = await withTransaction((conn) =>
      changeStatus(conn, id, decision, req.user.user_id, comment ? comment.trim() : null)
    );
    res.json({ requisitionId: id, status: result.to });
  } catch (err) {
    next(err);
  }
}

// ---------- close (the requester confirms they received the items) ----------
async function closeRequisition(req, res, next) {
  try {
    const id = Number(req.params.id);
    await withTransaction(async (conn) => {
      if (req.user.role_name === ROLES.REQUESTER) {
        const [[r]] = await conn.execute('SELECT requested_by FROM requisitions WHERE requisition_id = ?', [id]);
        if (!r) throw httpError(404, 'Requisition not found.');
        if (r.requested_by !== req.user.user_id) throw httpError(403, 'You can only close your own requisitions.');
      }
      await changeStatus(conn, id, 'closed', req.user.user_id, 'Receipt confirmed');
    });
    res.json({ requisitionId: id, status: 'closed' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createRequisition, listRequisitions, getRequisition, decide, closeRequisition };
