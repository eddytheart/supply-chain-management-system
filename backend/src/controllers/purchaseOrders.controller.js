// FR9: raise a purchase order from an approved requisition.
// FR10: record goods received against a purchase order (partial deliveries allowed).
// FR11: track purchase order status (ordered -> delivered -> closed).
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { withTransaction } = require('../utils/transaction');
const { logAction } = require('../utils/audit');
const { changeStatus } = require('../utils/requisitionStatus');

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const PO_STATUSES = ['ordered', 'delivered', 'closed'];

// ---------- FR9: create ----------
// Body: { requisitionId, supplierId, items?: [{ itemId, quantity, unitPrice? }] }
// If items is left out, every requisition line is ordered. Prices default to the supplier's price list.
async function createPurchaseOrder(req, res, next) {
  try {
    const { requisitionId, supplierId, items } = req.body || {};
    if (!Number.isInteger(requisitionId) || !Number.isInteger(supplierId)) {
      throw httpError(400, 'requisitionId and supplierId are required.');
    }

    const result = await withTransaction(async (conn) => {
      const [[supplier]] = await conn.execute('SELECT is_active FROM suppliers WHERE supplier_id = ?', [supplierId]);
      if (!supplier) throw httpError(400, 'Supplier not found.');
      if (!supplier.is_active) throw httpError(400, 'This supplier is inactive.');

      const [reqItems] = await conn.execute(
        'SELECT item_id, quantity_requested FROM requisition_items WHERE requisition_id = ?',
        [requisitionId]
      );
      if (reqItems.length === 0) throw httpError(404, 'Requisition not found.');

      // Decide the order lines.
      let lines;
      if (items === undefined) {
        lines = reqItems.map((r) => ({ itemId: r.item_id, quantity: r.quantity_requested, unitPrice: undefined }));
      } else {
        if (!Array.isArray(items) || items.length === 0) throw httpError(400, 'items must be a non-empty list.');
        const allowed = new Set(reqItems.map((r) => r.item_id));
        const seen = new Set();
        lines = items.map((l) => {
          if (!Number.isInteger(l.itemId) || !Number.isInteger(l.quantity) || l.quantity <= 0) {
            throw httpError(400, 'Each line needs a valid itemId and a whole-number quantity above zero.');
          }
          if (!allowed.has(l.itemId)) throw httpError(400, `Item ${l.itemId} is not on this requisition.`);
          if (seen.has(l.itemId)) throw httpError(400, 'The same item appears more than once.');
          seen.add(l.itemId);
          return l;
        });
      }

      // Work out each price: explicit unitPrice first, then the supplier's price list.
      const [priceRows] = await conn.execute('SELECT item_id, unit_price FROM supplier_items WHERE supplier_id = ?', [supplierId]);
      const priceList = new Map(priceRows.map((p) => [p.item_id, Number(p.unit_price)]));
      for (const line of lines) {
        if (line.unitPrice !== undefined) {
          if (typeof line.unitPrice !== 'number' || line.unitPrice < 0) throw httpError(400, 'unitPrice must be a number, zero or more.');
        } else if (priceList.has(line.itemId)) {
          line.unitPrice = priceList.get(line.itemId);
        } else {
          throw httpError(400, `This supplier has no price for item ${line.itemId}. Provide a unitPrice.`);
        }
      }

      const [po] = await conn.execute(
        'INSERT INTO purchase_orders (requisition_id, supplier_id, created_by, order_date, status) VALUES (?, ?, ?, CURDATE(), ?)',
        [requisitionId, supplierId, req.user.user_id, 'ordered']
      );
      const poId = po.insertId;
      for (const line of lines) {
        await conn.execute(
          'INSERT INTO purchase_order_items (po_id, item_id, quantity_ordered, unit_price) VALUES (?, ?, ?, ?)',
          [poId, line.itemId, line.quantity, line.unitPrice]
        );
      }

      // Moves the requisition approved -> ordered. Throws (and rolls everything back) if it was not approved.
      await changeStatus(conn, requisitionId, 'ordered', req.user.user_id, `Purchase order ${poId} raised`);
      await logAction(req.user.user_id, 'PO_CREATED', 'purchase_orders', poId, conn);

      const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
      return { poId, status: 'ordered', totalValue: total };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------- FR11: list and detail ----------
async function listPurchaseOrders(req, res, next) {
  try {
    const { status } = req.query;
    if (status && !PO_STATUSES.includes(status)) throw httpError(400, 'Unknown status filter.');

    const [rows] = await pool.execute(
      `SELECT po.po_id AS poId, po.requisition_id AS requisitionId, s.supplier_name AS supplier,
              po.order_date AS orderDate, po.status,
              COALESCE(SUM(poi.quantity_ordered * poi.unit_price), 0) AS totalValue
       FROM purchase_orders po
       JOIN suppliers s ON s.supplier_id = po.supplier_id
       LEFT JOIN purchase_order_items poi ON poi.po_id = po.po_id
       ${status ? 'WHERE po.status = ?' : ''}
       GROUP BY po.po_id, po.requisition_id, s.supplier_name, po.order_date, po.status
       ORDER BY po.po_id DESC`,
      status ? [status] : []
    );
    res.json(rows.map((r) => ({ ...r, totalValue: num(r.totalValue) })));
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrder(req, res, next) {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.execute(
      `SELECT po.po_id AS poId, po.requisition_id AS requisitionId, po.supplier_id AS supplierId,
              s.supplier_name AS supplier, po.order_date AS orderDate, po.status, u.full_name AS createdBy
       FROM purchase_orders po
       JOIN suppliers s ON s.supplier_id = po.supplier_id
       JOIN users u ON u.user_id = po.created_by
       WHERE po.po_id = ?`,
      [id]
    );
    if (rows.length === 0) throw httpError(404, 'Purchase order not found.');

    const [items] = await pool.execute(
      `SELECT i.item_id AS itemId, i.item_name AS itemName, i.unit,
              poi.quantity_ordered AS quantityOrdered, poi.unit_price AS unitPrice,
              COALESCE((SELECT SUM(gri.quantity_received)
                        FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.receipt_id = gri.receipt_id
                        WHERE gr.po_id = poi.po_id AND gri.item_id = poi.item_id), 0) AS quantityReceived
       FROM purchase_order_items poi JOIN items i ON i.item_id = poi.item_id
       WHERE poi.po_id = ? ORDER BY i.item_name`,
      [id]
    );
    const [receipts] = await pool.execute(
      `SELECT gr.receipt_id AS receiptId, gr.received_date AS receivedDate, u.full_name AS receivedBy
       FROM goods_receipts gr JOIN users u ON u.user_id = gr.received_by
       WHERE gr.po_id = ? ORDER BY gr.receipt_id`,
      [id]
    );
    for (const r of receipts) {
      const [lines] = await pool.execute(
        `SELECT i.item_name AS itemName, gri.quantity_received AS quantityReceived
         FROM goods_receipt_items gri JOIN items i ON i.item_id = gri.item_id
         WHERE gri.receipt_id = ? ORDER BY i.item_name`,
        [r.receiptId]
      );
      r.items = lines;
    }

    const cleanItems = items.map((i) => ({
      ...i,
      unitPrice: num(i.unitPrice),
      quantityReceived: num(i.quantityReceived),
      outstanding: i.quantityOrdered - num(i.quantityReceived),
    }));
    const totalValue = cleanItems.reduce((sum, i) => sum + i.quantityOrdered * i.unitPrice, 0);

    res.json({ ...rows[0], totalValue, items: cleanItems, receipts });
  } catch (err) {
    next(err);
  }
}

// ---------- FR10: receive goods ----------
// Body: { items: [{ itemId, quantity }] }. Each line becomes a stock batch, so stock updates automatically (FR13).
async function receiveGoods(req, res, next) {
  try {
    const poId = Number(req.params.id);
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) throw httpError(400, 'List the items received.');

    const result = await withTransaction(async (conn) => {
      const [[po]] = await conn.execute('SELECT status FROM purchase_orders WHERE po_id = ? FOR UPDATE', [poId]);
      if (!po) throw httpError(404, 'Purchase order not found.');
      if (po.status !== 'ordered') throw httpError(409, `This purchase order is "${po.status}", so goods cannot be received against it.`);

      const [ordered] = await conn.execute(
        `SELECT poi.item_id, poi.quantity_ordered,
                COALESCE((SELECT SUM(gri.quantity_received)
                          FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.receipt_id = gri.receipt_id
                          WHERE gr.po_id = poi.po_id AND gri.item_id = poi.item_id), 0) AS received
         FROM purchase_order_items poi WHERE poi.po_id = ?`,
        [poId]
      );
      const outstanding = new Map(ordered.map((o) => [o.item_id, o.quantity_ordered - Number(o.received)]));

      const seen = new Set();
      for (const line of items) {
        if (!Number.isInteger(line.itemId) || !Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw httpError(400, 'Each line needs a valid itemId and a whole-number quantity above zero.');
        }
        if (!outstanding.has(line.itemId)) throw httpError(400, `Item ${line.itemId} is not on this purchase order.`);
        if (seen.has(line.itemId)) throw httpError(400, 'The same item appears more than once.');
        seen.add(line.itemId);
        if (line.quantity > outstanding.get(line.itemId)) {
          throw httpError(400, `Item ${line.itemId}: only ${outstanding.get(line.itemId)} still outstanding, but ${line.quantity} entered.`);
        }
      }

      const [gr] = await conn.execute(
        'INSERT INTO goods_receipts (po_id, received_by, received_date) VALUES (?, ?, CURDATE())',
        [poId, req.user.user_id]
      );
      const receiptId = gr.insertId;

      for (const line of items) {
        const [gri] = await conn.execute(
          'INSERT INTO goods_receipt_items (receipt_id, item_id, quantity_received) VALUES (?, ?, ?)',
          [receiptId, line.itemId, line.quantity]
        );
        await conn.execute(
          'INSERT INTO stock_batches (receipt_item_id, item_id, received_date, quantity_remaining) VALUES (?, ?, CURDATE(), ?)',
          [gri.insertId, line.itemId, line.quantity]
        );
        outstanding.set(line.itemId, outstanding.get(line.itemId) - line.quantity);
      }
      await logAction(req.user.user_id, 'GOODS_RECEIVED', 'goods_receipts', receiptId, conn);

      let poStatus = 'ordered';
      if ([...outstanding.values()].every((q) => q === 0)) {
        await conn.execute("UPDATE purchase_orders SET status = 'delivered' WHERE po_id = ?", [poId]);
        await logAction(req.user.user_id, 'PO_DELIVERED', 'purchase_orders', poId, conn);
        poStatus = 'delivered';
      }
      return { receiptId, poStatus };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// ---------- close ----------
async function closePurchaseOrder(req, res, next) {
  try {
    const poId = Number(req.params.id);
    await withTransaction(async (conn) => {
      const [[po]] = await conn.execute('SELECT status FROM purchase_orders WHERE po_id = ? FOR UPDATE', [poId]);
      if (!po) throw httpError(404, 'Purchase order not found.');
      if (po.status !== 'delivered') throw httpError(409, 'Only a fully delivered purchase order can be closed.');
      await conn.execute("UPDATE purchase_orders SET status = 'closed' WHERE po_id = ?", [poId]);
      await logAction(req.user.user_id, 'PO_CLOSED', 'purchase_orders', poId, conn);
    });
    res.json({ poId, status: 'closed' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPurchaseOrder, listPurchaseOrders, getPurchaseOrder, receiveGoods, closePurchaseOrder };
