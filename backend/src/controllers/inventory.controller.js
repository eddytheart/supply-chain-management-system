// FR13: stock updates automatically on receipt (see receiveGoods) and on issue (FIFO by batch).
// FR14: items at or below their reorder level are flagged.
// FR15: manual stock adjustments are recorded with a reason.
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { withTransaction } = require('../utils/transaction');
const { logAction } = require('../utils/audit');
const { changeStatus } = require('../utils/requisitionStatus');

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

const STOCK_SQL = `SELECT item_id AS itemId, item_name AS itemName, unit, reorder_level AS reorderLevel,
  quantity_in_stock AS quantityInStock, is_low_stock AS isLowStock FROM v_item_stock`;

function cleanStock(rows) {
  return rows.map((r) => ({ ...r, quantityInStock: num(r.quantityInStock), isLowStock: r.isLowStock === 1 }));
}

// ---------- stock levels (FR12, FR14) ----------
async function listStock(req, res, next) {
  try {
    const lowOnly = req.query.lowOnly === 'true';
    const [rows] = await pool.query(`${STOCK_SQL} ${lowOnly ? 'WHERE is_low_stock = 1' : ''} ORDER BY item_name`);
    res.json(cleanStock(rows));
  } catch (err) {
    next(err);
  }
}

async function listBatches(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT batch_id AS batchId, received_date AS receivedDate, quantity_remaining AS quantityRemaining
       FROM stock_batches WHERE item_id = ? ORDER BY received_date, batch_id`,
      [Number(req.params.itemId)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

// ---------- can this requisition be fulfilled from stock? ----------
async function stockCheck(req, res, next) {
  try {
    const id = Number(req.params.id);
    const [[r]] = await pool.execute('SELECT status FROM requisitions WHERE requisition_id = ?', [id]);
    if (!r) throw httpError(404, 'Requisition not found.');

    const [rows] = await pool.execute(
      `SELECT i.item_id AS itemId, i.item_name AS itemName, i.unit, ri.quantity_requested AS quantityRequested,
              COALESCE((SELECT SUM(b.quantity_remaining) FROM stock_batches b WHERE b.item_id = i.item_id), 0) AS quantityInStock
       FROM requisition_items ri JOIN items i ON i.item_id = ri.item_id
       WHERE ri.requisition_id = ? ORDER BY i.item_name`,
      [id]
    );
    const items = rows.map((x) => ({
      ...x,
      quantityInStock: num(x.quantityInStock),
      sufficient: num(x.quantityInStock) >= x.quantityRequested,
    }));
    res.json({ requisitionId: id, status: r.status, canFulfilFromStock: items.every((x) => x.sufficient), items });
  } catch (err) {
    next(err);
  }
}

// ---------- issue stock for a requisition (FIFO) ----------
// The whole requisition is issued or nothing is (no partial issues).
async function issueStock(req, res, next) {
  try {
    const requisitionId = Number(req.params.id);

    const result = await withTransaction(async (conn) => {
      const [[r]] = await conn.execute('SELECT status FROM requisitions WHERE requisition_id = ? FOR UPDATE', [requisitionId]);
      if (!r) throw httpError(404, 'Requisition not found.');
      if (!['approved', 'ordered'].includes(r.status)) {
        throw httpError(409, `A requisition that is "${r.status}" cannot have stock issued.`);
      }

      const [lines] = await conn.execute(
        `SELECT ri.item_id, ri.quantity_requested, i.item_name
         FROM requisition_items ri JOIN items i ON i.item_id = ri.item_id
         WHERE ri.requisition_id = ? ORDER BY ri.item_id`, // fixed order avoids database deadlocks
        [requisitionId]
      );

      const [issue] = await conn.execute(
        'INSERT INTO stock_issues (requisition_id, issued_by, issue_date) VALUES (?, ?, CURDATE())',
        [requisitionId, req.user.user_id]
      );
      const issueId = issue.insertId;
      const summary = [];

      for (const line of lines) {
        // FIFO: oldest batch first (by received date, then batch id).
        const [batches] = await conn.execute(
          `SELECT batch_id, quantity_remaining FROM stock_batches
           WHERE item_id = ? AND quantity_remaining > 0
           ORDER BY received_date, batch_id FOR UPDATE`,
          [line.item_id]
        );

        let needed = line.quantity_requested;
        const used = [];
        for (const b of batches) {
          if (needed === 0) break;
          const take = Math.min(needed, b.quantity_remaining);
          await conn.execute('UPDATE stock_batches SET quantity_remaining = quantity_remaining - ? WHERE batch_id = ?', [take, b.batch_id]);
          await conn.execute(
            'INSERT INTO stock_issue_items (issue_id, batch_id, quantity_issued) VALUES (?, ?, ?)',
            [issueId, b.batch_id, take]
          );
          used.push({ batchId: b.batch_id, quantity: take });
          needed -= take;
        }
        if (needed > 0) {
          throw httpError(409, `Not enough stock of "${line.item_name}": short by ${needed}.`);
        }
        summary.push({ itemId: line.item_id, itemName: line.item_name, quantity: line.quantity_requested, batches: used });
      }

      await changeStatus(conn, requisitionId, 'delivered', req.user.user_id, 'Issued from stock');
      await logAction(req.user.user_id, 'STOCK_ISSUED', 'stock_issues', issueId, conn);
      return { issueId, requisitionId, status: 'delivered', items: summary };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------- FR15: manual adjustment ----------
// Body: { batchId, quantityChange (positive or negative, not zero), reason }
async function adjustStock(req, res, next) {
  try {
    const { batchId, quantityChange, reason } = req.body || {};
    if (!Number.isInteger(batchId)) throw httpError(400, 'batchId is required.');
    if (!Number.isInteger(quantityChange) || quantityChange === 0) throw httpError(400, 'quantityChange must be a whole number other than zero.');
    if (!reason || !reason.trim()) throw httpError(400, 'A reason is required for every adjustment.');

    const result = await withTransaction(async (conn) => {
      const [[batch]] = await conn.execute('SELECT quantity_remaining FROM stock_batches WHERE batch_id = ? FOR UPDATE', [batchId]);
      if (!batch) throw httpError(404, 'Stock batch not found.');
      const newQty = batch.quantity_remaining + quantityChange;
      if (newQty < 0) throw httpError(409, `That would take the batch below zero (it holds ${batch.quantity_remaining}).`);

      await conn.execute('UPDATE stock_batches SET quantity_remaining = ? WHERE batch_id = ?', [newQty, batchId]);
      const [adj] = await conn.execute(
        'INSERT INTO stock_adjustments (batch_id, quantity_change, reason, adjusted_by) VALUES (?, ?, ?, ?)',
        [batchId, quantityChange, reason.trim(), req.user.user_id]
      );
      await logAction(req.user.user_id, 'STOCK_ADJUSTED', 'stock_adjustments', adj.insertId, conn);
      return { adjustmentId: adj.insertId, batchId, newQuantity: newQty };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { listStock, listBatches, stockCheck, issueStock, adjustStock };
