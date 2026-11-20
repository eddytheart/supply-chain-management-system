import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { DataState, Field, Notice, PageHeader, useLoad } from '../ui';

export default function RequisitionNew() {
  const navigate = useNavigate();
  const { data: items, error: loadError, loading } = useLoad(() => api.get('/items'), []);
  const [lines, setLines] = useState([{ itemId: '', quantity: '' }]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const chosen = new Set(lines.map((l) => l.itemId).filter(Boolean));

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const payload = [];
    for (const [i, l] of lines.entries()) {
      const qty = Number(l.quantity);
      if (!l.itemId || !Number.isInteger(qty) || qty <= 0) {
        setError(`Line ${i + 1}: choose an item and enter a whole number above zero.`);
        return;
      }
      payload.push({ itemId: Number(l.itemId), quantity: qty });
    }
    setBusy(true);
    try {
      const res = await api.post('/requisitions', { reason: reason.trim() || null, items: payload });
      navigate(`/requisitions/${res.requisitionId}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="New requisition" subtitle="List what your department needs. The procurement officer will review it." />
      <DataState loading={loading} error={loadError}>
        {items && (
          <form onSubmit={onSubmit} style={{ maxWidth: 680 }}>
            {error && <Notice kind="error">{error}</Notice>}
            <h2 style={{ marginBottom: 12 }}>Items</h2>
            {lines.map((line, i) => (
              <div className="line-row" key={i}>
                <Field label={`Item ${i + 1}`}>
                  <select value={line.itemId} onChange={(e) => setLine(i, { itemId: e.target.value })}>
                    <option value="">Choose an item</option>
                    {items.map((it) => (
                      <option key={it.itemId} value={it.itemId} disabled={chosen.has(String(it.itemId)) && String(it.itemId) !== line.itemId}>
                        {it.itemName} ({it.unit})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Quantity ${i + 1}`}>
                  <input type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                </Field>
                {lines.length > 1 && (
                  <button type="button" className="btn btn-quiet" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                    Remove line {i + 1}
                  </button>
                )}
              </div>
            ))}
            <p>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setLines([...lines, { itemId: '', quantity: '' }])} disabled={lines.length >= items.length}>
                Add another item
              </button>
            </p>
            <Field label="Reason" hint="Optional. A short reason helps the procurement officer decide.">
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </Field>
            <button type="submit" className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit requisition'}</button>
          </form>
        )}
      </DataState>
    </>
  );
}
