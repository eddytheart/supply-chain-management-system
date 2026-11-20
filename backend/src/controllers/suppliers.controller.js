// FR7: add, edit and view suppliers.  FR8: view each supplier's price list and past orders.
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { logAction } = require('../utils/audit');

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

const SUPPLIER_COLUMNS = `supplier_id AS supplierId, supplier_name AS supplierName, contact_person AS contactPerson,
  phone, email, address, is_active AS isActive`;

async function listSuppliers(req, res, next) {
  try {
    const onlyActive = req.query.active === 'true';
    const [rows] = await pool.query(
      `SELECT ${SUPPLIER_COLUMNS} FROM suppliers ${onlyActive ? 'WHERE is_active = 1' : ''} ORDER BY supplier_name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getSupplier(req, res, next) {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.execute(`SELECT ${SUPPLIER_COLUMNS} FROM suppliers WHERE supplier_id = ?`, [id]);
    if (rows.length === 0) throw httpError(404, 'Supplier not found.');

    const [items] = await pool.execute(
      `SELECT i.item_id AS itemId, i.item_name AS itemName, i.unit, si.unit_price AS unitPrice
       FROM supplier_items si JOIN items i ON i.item_id = si.item_id
       WHERE si.supplier_id = ? ORDER BY i.item_name`,
      [id]
    );
    const [orders] = await pool.execute(
      `SELECT po.po_id AS poId, po.order_date AS orderDate, po.status,
              COALESCE(SUM(poi.quantity_ordered * poi.unit_price), 0) AS totalValue
       FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.po_id = po.po_id
       WHERE po.supplier_id = ?
       GROUP BY po.po_id, po.order_date, po.status
       ORDER BY po.order_date DESC, po.po_id DESC`,
      [id]
    );

    res.json({
      ...rows[0],
      items: items.map((i) => ({ ...i, unitPrice: num(i.unitPrice) })),
      orders: orders.map((o) => ({ ...o, totalValue: num(o.totalValue) })),
    });
  } catch (err) {
    next(err);
  }
}

async function createSupplier(req, res, next) {
  try {
    const { supplierName, contactPerson = null, phone = null, email = null, address = null } = req.body || {};
    if (!supplierName || !supplierName.trim()) throw httpError(400, 'supplierName is required.');

    const [result] = await pool.execute(
      'INSERT INTO suppliers (supplier_name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
      [supplierName.trim(), contactPerson, phone, email, address]
    );
    await logAction(req.user.user_id, 'CREATE_SUPPLIER', 'suppliers', result.insertId);
    res.status(201).json({ supplierId: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateSupplier(req, res, next) {
  try {
    const id = Number(req.params.id);
    const map = { supplierName: 'supplier_name', contactPerson: 'contact_person', phone: 'phone', email: 'email', address: 'address' };
    const fields = [];
    const values = [];
    for (const [key, column] of Object.entries(map)) {
      if (req.body && req.body[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(req.body[key]);
      }
    }
    if (fields.length === 0) throw httpError(400, 'Nothing to update.');
    values.push(id);

    const [result] = await pool.execute(`UPDATE suppliers SET ${fields.join(', ')} WHERE supplier_id = ?`, values);
    if (result.affectedRows === 0) throw httpError(404, 'Supplier not found.');
    await logAction(req.user.user_id, 'UPDATE_SUPPLIER', 'suppliers', id);
    res.json({ message: 'Supplier updated.' });
  } catch (err) {
    next(err);
  }
}

// Suppliers are never deleted, only deactivated, so old purchase orders keep their supplier.
async function setSupplierActive(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') throw httpError(400, 'isActive must be true or false.');
    const [result] = await pool.execute('UPDATE suppliers SET is_active = ? WHERE supplier_id = ?', [isActive ? 1 : 0, id]);
    if (result.affectedRows === 0) throw httpError(404, 'Supplier not found.');
    await logAction(req.user.user_id, isActive ? 'ACTIVATE_SUPPLIER' : 'DEACTIVATE_SUPPLIER', 'suppliers', id);
    res.json({ message: isActive ? 'Supplier activated.' : 'Supplier deactivated.' });
  } catch (err) {
    next(err);
  }
}

// Add or change the price a supplier charges for an item.
async function setSupplierPrice(req, res, next) {
  try {
    const supplierId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const price = Number(req.body && req.body.unitPrice);
    if (!Number.isFinite(price) || price < 0) throw httpError(400, 'unitPrice must be a number, zero or more.');

    await pool.execute(
      `INSERT INTO supplier_items (supplier_id, item_id, unit_price) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE unit_price = VALUES(unit_price)`,
      [supplierId, itemId, price]
    );
    await logAction(req.user.user_id, 'SET_SUPPLIER_PRICE', 'supplier_items', supplierId);
    res.json({ message: 'Price saved.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listSuppliers, getSupplier, createSupplier, updateSupplier, setSupplierActive, setSupplierPrice };
