// FR12: maintain the item catalogue (name, unit, reorder level). Stock quantities come from stock batches.
const pool = require('../config/db');
const { httpError } = require('../utils/httpError');
const { logAction } = require('../utils/audit');

async function listItems(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT item_id AS itemId, item_name AS itemName, unit, reorder_level AS reorderLevel FROM items ORDER BY item_name'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createItem(req, res, next) {
  try {
    const { itemName, unit, reorderLevel = 0 } = req.body || {};
    if (!itemName || !itemName.trim() || !unit || !unit.trim()) throw httpError(400, 'itemName and unit are required.');
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) throw httpError(400, 'reorderLevel must be a whole number, zero or more.');

    const [result] = await pool.execute('INSERT INTO items (item_name, unit, reorder_level) VALUES (?, ?, ?)', [
      itemName.trim(), unit.trim(), reorderLevel,
    ]);
    await logAction(req.user.user_id, 'CREATE_ITEM', 'items', result.insertId);
    res.status(201).json({ itemId: result.insertId });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { itemName, unit, reorderLevel } = req.body || {};
    const fields = [];
    const values = [];
    if (itemName !== undefined) { fields.push('item_name = ?'); values.push(itemName); }
    if (unit !== undefined) { fields.push('unit = ?'); values.push(unit); }
    if (reorderLevel !== undefined) {
      if (!Number.isInteger(reorderLevel) || reorderLevel < 0) throw httpError(400, 'reorderLevel must be a whole number, zero or more.');
      fields.push('reorder_level = ?');
      values.push(reorderLevel);
    }
    if (fields.length === 0) throw httpError(400, 'Nothing to update.');
    values.push(id);

    const [result] = await pool.execute(`UPDATE items SET ${fields.join(', ')} WHERE item_id = ?`, values);
    if (result.affectedRows === 0) throw httpError(404, 'Item not found.');
    await logAction(req.user.user_id, 'UPDATE_ITEM', 'items', id);
    res.json({ message: 'Item updated.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listItems, createItem, updateItem };
