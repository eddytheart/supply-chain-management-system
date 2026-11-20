// FR16: reports on requisitions, stock levels, low-stock items and purchase orders by supplier.
// FR17: every report can be filtered by date range (where dates apply) and exported as CSV (add ?format=csv).
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { sendCsv } = require('../utils/csv');

const STATUSES = ['submitted', 'approved', 'rejected', 'ordered', 'delivered', 'closed'];
const num = (v) => (v === null || v === undefined ? 0 : Number(v));

function validDate(value, name) {
  if (value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw httpError(400, `${name} must be a date in the form YYYY-MM-DD.`);
  }
  return value;
}

// Builds "AND col >= ? AND col < next day" so the "to" date is included in full.
function dateFilter(column, from, to) {
  const parts = [];
  const params = [];
  if (from) { parts.push(`${column} >= ?`); params.push(from); }
  if (to) { parts.push(`${column} < DATE_ADD(?, INTERVAL 1 DAY)`); params.push(to); }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', params };
}

function datesFrom(req) {
  const from = validDate(req.query.from, 'from');
  const to = validDate(req.query.to, 'to');
  if (from && to && from > to) throw httpError(400, '"from" must not be after "to".');
  return { from, to };
}

// ---------- requisitions by status and by department ----------
async function requisitionsReport(req, res, next) {
  try {
    const { from, to } = datesFrom(req);
    const f = dateFilter('r.created_at', from, to);

    const [byStatusRows] = await pool.execute(`SELECT r.status, COUNT(*) AS count FROM requisitions r ${f.sql} GROUP BY r.status`, f.params);
    const counts = new Map(byStatusRows.map((x) => [x.status, Number(x.count)]));
    const byStatus = STATUSES.map((s) => ({ status: s, count: counts.get(s) || 0 }));

    const [byDeptRows] = await pool.execute(
      `SELECT d.department_name AS department, COUNT(*) AS count
       FROM requisitions r JOIN departments d ON d.department_id = r.department_id
       ${f.sql} GROUP BY d.department_name ORDER BY count DESC, d.department_name`,
      f.params
    );
    const byDepartment = byDeptRows.map((x) => ({ department: x.department, count: Number(x.count) }));
    const total = byStatus.reduce((sum, x) => sum + x.count, 0);

    if (req.query.format === 'csv') {
      const rows = [
        ...byStatus.map((x) => ({ section: 'By status', name: x.status, count: x.count })),
        ...byDepartment.map((x) => ({ section: 'By department', name: x.department, count: x.count })),
      ];
      return sendCsv(res, 'requisitions_report.csv', rows, ['section', 'name', 'count']);
    }
    res.json({ from, to, total, byStatus, byDepartment });
  } catch (err) {
    next(err);
  }
}

// ---------- stock levels ----------
async function stockReport(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT item_name AS item, unit, reorder_level AS reorderLevel, quantity_in_stock AS quantityInStock,
              is_low_stock AS isLowStock FROM v_item_stock ORDER BY item_name`
    );
    const data = rows.map((r) => ({ ...r, quantityInStock: num(r.quantityInStock), isLowStock: r.isLowStock === 1 }));
    if (req.query.format === 'csv') {
      return sendCsv(res, 'stock_report.csv', data.map((r) => ({ ...r, isLowStock: r.isLowStock ? 'Yes' : 'No' })),
        ['item', 'unit', 'reorderLevel', 'quantityInStock', 'isLowStock']);
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function lowStockReport(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT item_name AS item, unit, reorder_level AS reorderLevel, quantity_in_stock AS quantityInStock
       FROM v_item_stock WHERE is_low_stock = 1 ORDER BY item_name`
    );
    const data = rows.map((r) => ({ ...r, quantityInStock: num(r.quantityInStock) }));
    if (req.query.format === 'csv') {
      return sendCsv(res, 'low_stock_report.csv', data, ['item', 'unit', 'reorderLevel', 'quantityInStock']);
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ---------- purchase orders by supplier ----------
async function purchaseOrdersReport(req, res, next) {
  try {
    const { from, to } = datesFrom(req);
    const f = dateFilter('po.order_date', from, to);

    const [rows] = await pool.execute(
      `SELECT s.supplier_name AS supplier, COUNT(DISTINCT po.po_id) AS orders,
              COALESCE(SUM(poi.quantity_ordered * poi.unit_price), 0) AS totalValue
       FROM purchase_orders po
       JOIN suppliers s ON s.supplier_id = po.supplier_id
       LEFT JOIN purchase_order_items poi ON poi.po_id = po.po_id
       ${f.sql} GROUP BY s.supplier_name ORDER BY totalValue DESC, s.supplier_name`,
      f.params
    );
    const bySupplier = rows.map((r) => ({ supplier: r.supplier, orders: Number(r.orders), totalValue: num(r.totalValue) }));
    const grandTotal = bySupplier.reduce((sum, r) => sum + r.totalValue, 0);

    if (req.query.format === 'csv') {
      return sendCsv(res, 'purchase_orders_report.csv', bySupplier, ['supplier', 'orders', 'totalValue']);
    }
    res.json({ from, to, grandTotal, bySupplier });
  } catch (err) {
    next(err);
  }
}

module.exports = { requisitionsReport, stockReport, lowStockReport, purchaseOrdersReport };
