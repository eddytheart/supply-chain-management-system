import { useState } from 'react';
import { api } from '../api';
import { ROLES, useAuth } from '../auth';
import { formatDate } from '../format';
import { DataState, Empty, Field, Modal, Notice, PageHeader, StatusChip, useLoad } from '../ui';

function ItemForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({ itemName: '', unit: '', reorderLevel: '0', ...initial });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    const reorderLevel = Number(form.reorderLevel);
    if (!form.itemName.trim() || !form.unit.trim()) return setError('Enter the item name and its unit, for example ream or box.');
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) return setError('The reorder level must be a whole number, zero or more.');
    setBusy(true);
    try {
      await onSubmit({ itemName: form.itemName.trim(), unit: form.unit.trim(), reorderLevel });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <Notice kind="error">{error}</Notice>}
      <Field label="Item name"><input type="text" value={form.itemName} onChange={set('itemName')} /></Field>
      <div className="inline-fields">
        <Field label="Unit"><input type="text" value={form.unit} onChange={set('unit')} /></Field>
        <Field label="Reorder level" hint="Stock at or below this is flagged as low."><input type="number" min="0" step="1" value={form.reorderLevel} onChange={set('reorderLevel')} /></Field>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}

function BatchesModal({ item, canAdjust, onClose, onChanged }) {
  const { data, error, loading, reload } = useLoad(() => api.get(`/inventory/stock/${item.itemId}/batches`), [item.itemId]);
  const [batchId, setBatchId] = useState('');
  const [change, setChange] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState('');

  async function submit(e) {
    e.preventDefault();
    setFormError('');
    setDone('');
    const quantityChange = Number(change);
    if (!batchId) return setFormError('Choose a batch.');
    if (!Number.isInteger(quantityChange) || quantityChange === 0) return setFormError('Enter a whole number other than zero. Use a minus sign to remove stock.');
    if (!reason.trim()) return setFormError('Give a reason for the adjustment.');
    try {
      const res = await api.post('/inventory/adjustments', { batchId: Number(batchId), quantityChange, reason: reason.trim() });
      setDone(`Batch ${batchId} now holds ${res.newQuantity}.`);
      setChange('');
      setReason('');
      reload();
      onChanged();
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <Modal title={`${item.itemName}: stock batches`} onClose={onClose}>
      <DataState loading={loading} error={error}>
        {data && data.length === 0 ? <Empty title="No stock has been received for this item yet." /> : (
          data && (
            <div className="table-wrap">
              <table className="ledger">
                <thead><tr><th>Batch</th><th>Received</th><th className="num">Remaining</th></tr></thead>
                <tbody>
                  {data.map((b) => (
                    <tr key={b.batchId}><td>{b.batchId}</td><td>{formatDate(b.receivedDate)}</td><td className="num">{b.quantityRemaining}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {canAdjust && data && data.length > 0 && (
          <form onSubmit={submit} style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 10 }}>Adjust stock</h3>
            {formError && <Notice kind="error">{formError}</Notice>}
            {done && <Notice kind="success">{done}</Notice>}
            <div className="inline-fields">
              <Field label="Batch">
                <select value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  <option value="">Choose a batch</option>
                  {data.map((b) => <option key={b.batchId} value={b.batchId}>Batch {b.batchId} ({b.quantityRemaining} left)</option>)}
                </select>
              </Field>
              <Field label="Change by"><input type="number" step="1" value={change} onChange={(e) => setChange(e.target.value)} /></Field>
            </div>
            <Field label="Reason"><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: damaged in storage" /></Field>
            <button type="submit" className="btn">Record adjustment</button>
          </form>
        )}
      </DataState>
    </Modal>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const isStore = user.role === ROLES.STORE;
  const [lowOnly, setLowOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const { data, error, loading, reload } = useLoad(() => api.get('/inventory/stock' + (lowOnly ? '?lowOnly=true' : '')), [lowOnly]);

  return (
    <>
      <PageHeader title="Inventory" subtitle="Stock is counted from the batches received, so the totals always match the records.">
        {isStore && <button type="button" className="btn" onClick={() => setAdding(true)}>Add item</button>}
      </PageHeader>

      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
        Show low stock only
      </label>

      <DataState loading={loading} error={error}>
        {data && data.length === 0 ? (
          <Empty title={lowOnly ? 'No items are low on stock.' : 'No items in the catalogue yet.'} />
        ) : (
          data && (
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr><th>Item</th><th>Unit</th><th className="num">In stock</th><th className="num">Reorder level</th><th>Level</th><th /></tr>
                </thead>
                <tbody>
                  {data.map((i) => (
                    <tr key={i.itemId}>
                      <td>{i.itemName}</td><td>{i.unit}</td><td className="num">{i.quantityInStock}</td><td className="num">{i.reorderLevel}</td>
                      <td><StatusChip status={i.isLowStock ? 'low' : 'ok'} /></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setViewing(i)} aria-label={`Batches for ${i.itemName}`}>Batches</button>
                          {isStore && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(i)} aria-label={`Edit ${i.itemName}`}>Edit</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </DataState>

      {adding && (
        <Modal title="Add item" onClose={() => setAdding(false)}>
          <ItemForm submitLabel="Add item" onCancel={() => setAdding(false)} onSubmit={async (body) => { await api.post('/items', body); setAdding(false); reload(); }} />
        </Modal>
      )}
      {editing && (
        <Modal title={`Edit ${editing.itemName}`} onClose={() => setEditing(null)}>
          <ItemForm
            initial={{ itemName: editing.itemName, unit: editing.unit, reorderLevel: String(editing.reorderLevel) }}
            submitLabel="Save changes"
            onCancel={() => setEditing(null)}
            onSubmit={async (body) => { await api.put(`/items/${editing.itemId}`, body); setEditing(null); reload(); }}
          />
        </Modal>
      )}
      {viewing && <BatchesModal item={viewing} canAdjust={isStore} onClose={() => setViewing(null)} onChanged={reload} />}
    </>
  );
}
