import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ROLES, useAuth } from '../auth';
import { capitalise, formatDate, formatDateTime, formatMoney } from '../format';
import { DataState, Field, Modal, Notice, PageHeader, StatusChip, useLoad } from '../ui';

const STEPS = ['submitted', 'approved', 'ordered', 'delivered', 'closed'];

// The memorable part of this page: where the requisition is on its way, and what was skipped.
function Progress({ status, history }) {
  const when = new Map();
  history.forEach((h) => !when.has(h.status) && when.set(h.status, h.changedAt));

  if (status === 'rejected') {
    return (
      <ol className="progress" aria-label="Requisition progress">
        <li className="done"><span className="step-name">Submitted</span><span className="step-note">{formatDate(when.get('submitted'))}</span></li>
        <li className="rejected"><span className="step-name">Rejected</span><span className="step-note">{formatDate(when.get('rejected'))}</span></li>
      </ol>
    );
  }

  const current = STEPS.indexOf(status);
  return (
    <ol className="progress" aria-label="Requisition progress">
      {STEPS.map((step, i) => {
        let state = 'todo';
        let note = '';
        if (i < current) {
          if (when.has(step)) { state = 'done'; note = formatDate(when.get(step)); }
          else { state = 'skipped'; note = 'Not needed, issued from stock'; }
        } else if (i === current) {
          state = step === 'closed' ? 'current final' : 'current';
          note = formatDate(when.get(step));
        }
        return (
          <li key={step} className={state} aria-current={i === current ? 'step' : undefined}>
            <span className="step-name">{capitalise(step)}</span>
            <span className="step-note">{note}</span>
          </li>
        );
      })}
    </ol>
  );
}

function nextStepText(status, role) {
  switch (status) {
    case 'submitted': return role === ROLES.PROCUREMENT ? 'This is waiting for your decision.' : 'Waiting for the procurement officer to approve or reject it.';
    case 'approved': return 'Approved. The store officer can issue it from stock, or the procurement officer can raise a purchase order if stock is short.';
    case 'ordered': return 'A purchase order has been raised. When the goods arrive and are recorded, the store officer can issue the items.';
    case 'delivered': return 'The items have been issued. The requester confirms receipt to close the requisition.';
    case 'rejected': return 'This requisition was rejected. Raise a new one if it is still needed.';
    default: return 'This requisition is complete.';
  }
}

function RejectModal({ onClose, onConfirm, busy }) {
  const [comment, setComment] = useState('');
  return (
    <Modal title="Reject requisition" onClose={onClose}>
      <Field label="Reason for rejecting" hint="The requester will see this.">
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
      </Field>
      <div className="dialog-actions">
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-danger" disabled={busy || !comment.trim()} onClick={() => onConfirm(comment.trim())}>Reject requisition</button>
      </div>
    </Modal>
  );
}

function PurchaseOrderModal({ requisition, onClose, onCreated }) {
  const { data: suppliers, error: loadError, loading } = useLoad(() => api.get('/suppliers?active=true'), []);
  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState(
    requisition.items.map((i) => ({ itemId: i.itemId, itemName: i.itemName, unit: i.unit, quantity: String(i.quantityRequested), unitPrice: '' }))
  );
  const [priceNote, setPriceNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // When a supplier is chosen, fill in the prices from that supplier's price list.
  async function chooseSupplier(id) {
    setSupplierId(id);
    setError('');
    if (!id) return;
    try {
      const s = await api.get(`/suppliers/${id}`);
      const prices = new Map(s.items.map((p) => [p.itemId, p.unitPrice]));
      setLines((ls) => ls.map((l) => ({ ...l, unitPrice: prices.has(l.itemId) ? String(prices.get(l.itemId)) : '' })));
      const missing = requisition.items.filter((i) => !prices.has(i.itemId)).length;
      setPriceNote(missing ? `${missing} item(s) have no price in this supplier's list. Enter a price for each.` : 'Prices come from the supplier price list. You can change them.');
    } catch (err) {
      setError(err.message);
    }
  }

  const setLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function submit() {
    setError('');
    if (!supplierId) return setError('Choose a supplier.');
    const items = [];
    for (const l of lines) {
      const quantity = Number(l.quantity);
      const unitPrice = Number(l.unitPrice);
      if (!Number.isInteger(quantity) || quantity <= 0) return setError(`${l.itemName}: enter a whole-number quantity above zero.`);
      if (l.unitPrice === '' || !Number.isFinite(unitPrice) || unitPrice < 0) return setError(`${l.itemName}: enter a unit price.`);
      items.push({ itemId: l.itemId, quantity, unitPrice });
    }
    setBusy(true);
    try {
      const res = await api.post('/purchase-orders', { requisitionId: requisition.requisitionId, supplierId: Number(supplierId), items });
      onCreated(res.poId);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  return (
    <Modal title="Raise purchase order" onClose={onClose}>
      <DataState loading={loading} error={loadError}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Supplier">
          <select value={supplierId} onChange={(e) => chooseSupplier(e.target.value)}>
            <option value="">Choose a supplier</option>
            {suppliers && suppliers.map((s) => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
          </select>
        </Field>
        {priceNote && <p className="muted">{priceNote}</p>}
        {lines.map((l, i) => (
          <div className="inline-fields" key={l.itemId} style={{ marginBottom: 10 }}>
            <p style={{ flex: '1 1 100%', margin: 0, fontWeight: 600 }}>{l.itemName} ({l.unit})</p>
            <Field label={`Quantity for ${l.itemName}`}>
              <input type="number" min="1" step="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
            </Field>
            <Field label={`Unit price for ${l.itemName}`}>
              <input type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
            </Field>
          </div>
        ))}
        <p><strong>Order total: {formatMoney(total)}</strong></p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" disabled={busy} onClick={submit}>Create purchase order</button>
        </div>
      </DataState>
    </Modal>
  );
}

export default function RequisitionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [modal, setModal] = useState(null); // 'reject' | 'po' | null
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const r = await api.get(`/requisitions/${id}`);
    let stock = null;
    let po = null;
    if ([ROLES.STORE, ROLES.PROCUREMENT].includes(user.role) && ['approved', 'ordered'].includes(r.status)) {
      stock = await api.get(`/requisitions/${id}/stock-check`);
    }
    if (user.role !== ROLES.REQUESTER && ['ordered', 'delivered', 'closed'].includes(r.status)) {
      const list = await api.get('/purchase-orders');
      po = list.find((p) => p.requisitionId === r.requisitionId) || null;
    }
    return { r, stock, po };
  }, [id]);

  async function run(work) {
    setBusy(true);
    setActionError('');
    try {
      await work();
      setModal(null);
      setConfirmIssue(false);
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DataState loading={loading} error={error}>
      {data && (() => {
        const { r, stock, po } = data;
        const isOwner = r.requestedById === user.userId;
        const canDecide = user.role === ROLES.PROCUREMENT && r.status === 'submitted';
        const canIssue = user.role === ROLES.STORE && ['approved', 'ordered'].includes(r.status);
        const canOrder = user.role === ROLES.PROCUREMENT && r.status === 'approved';
        const canClose = r.status === 'delivered' && ((user.role === ROLES.REQUESTER && isOwner) || user.role === ROLES.PROCUREMENT);
        const stockByItem = stock ? new Map(stock.items.map((s) => [s.itemId, s])) : null;

        return (
          <>
            <PageHeader title={`Requisition #${r.requisitionId}`} subtitle={<StatusChip status={r.status} />}>
              <Link to="/requisitions" className="btn btn-quiet">Back to list</Link>
            </PageHeader>

            {actionError && <Notice kind="error">{actionError}</Notice>}

            <Progress status={r.status} history={r.history} />
            <p className="next-step">{nextStepText(r.status, user.role)}</p>

            {(canDecide || canIssue || canOrder || canClose) && (
              <div className="actions" style={{ marginTop: 16 }}>
                {canDecide && <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.patch(`/requisitions/${id}/decision`, { decision: 'approved' }))}>Approve</button>}
                {canDecide && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setModal('reject')}>Reject</button>}
                {canOrder && <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setModal('po')}>Raise purchase order</button>}
                {canIssue && !confirmIssue && (
                  <button type="button" className="btn" disabled={busy || (stock && !stock.canFulfilFromStock)} onClick={() => setConfirmIssue(true)}>Issue from stock</button>
                )}
                {canIssue && confirmIssue && (
                  <>
                    <span style={{ alignSelf: 'center' }}>Issue every item now? Stock is taken from the oldest batches first.</span>
                    <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.post(`/requisitions/${id}/issue`))}>Confirm issue</button>
                    <button type="button" className="btn btn-quiet" onClick={() => setConfirmIssue(false)}>Cancel</button>
                  </>
                )}
                {canClose && <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.patch(`/requisitions/${id}/close`))}>Confirm received and close</button>}
              </div>
            )}
            {canIssue && stock && !stock.canFulfilFromStock && (
              <Notice kind="warn">There is not enough stock to issue this requisition yet. Raise a purchase order and record the goods when they arrive.</Notice>
            )}

            <section className="section">
              <h2>Details</h2>
              <dl className="facts">
                <dt>Requested by</dt><dd>{r.requestedBy}</dd>
                <dt>Department</dt><dd>{r.department}</dd>
                <dt>Raised</dt><dd>{formatDateTime(r.createdAt)}</dd>
                <dt>Reason</dt><dd>{r.reason || <span className="muted">No reason given</span>}</dd>
                {po && (<><dt>Purchase order</dt><dd><Link to={`/purchase-orders/${po.poId}`}>PO {po.poId}</Link> from {po.supplier}</dd></>)}
              </dl>
            </section>

            <section className="section">
              <h2>Items</h2>
              <div className="table-wrap">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Item</th><th>Unit</th><th className="num">Requested</th>
                      {stockByItem && <><th className="num">In stock</th><th>Enough?</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {r.items.map((i) => {
                      const s = stockByItem && stockByItem.get(i.itemId);
                      return (
                        <tr key={i.itemId}>
                          <td>{i.itemName}</td><td>{i.unit}</td><td className="num">{i.quantityRequested}</td>
                          {stockByItem && s && <><td className="num">{s.quantityInStock}</td><td><StatusChip status={s.sufficient ? 'ok' : 'low'} /></td></>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="section">
              <h2>History</h2>
              <div className="table-wrap">
                <table className="ledger">
                  <thead><tr><th>Status</th><th>By</th><th>When</th><th>Comment</th></tr></thead>
                  <tbody>
                    {r.history.map((h, idx) => (
                      <tr key={idx}>
                        <td><StatusChip status={h.status} /></td><td>{h.changedBy}</td><td>{formatDateTime(h.changedAt)}</td>
                        <td>{h.comment || <span className="muted">None</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {modal === 'reject' && (
              <RejectModal busy={busy} onClose={() => setModal(null)} onConfirm={(comment) => run(() => api.patch(`/requisitions/${id}/decision`, { decision: 'rejected', comment }))} />
            )}
            {modal === 'po' && <PurchaseOrderModal requisition={r} onClose={() => setModal(null)} onCreated={(poId) => navigate(`/purchase-orders/${poId}`)} />}
          </>
        );
      })()}
    </DataState>
  );
}
