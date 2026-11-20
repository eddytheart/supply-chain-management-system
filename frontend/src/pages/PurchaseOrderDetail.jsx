import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ROLES, useAuth } from '../auth';
import { formatDate, formatMoney } from '../format';
import { DataState, Empty, Field, Notice, PageHeader, StatusChip, useLoad } from '../ui';

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [received, setReceived] = useState({});
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: po, error, loading, reload } = useLoad(() => api.get(`/purchase-orders/${id}`), [id]);

  async function recordReceipt(e) {
    e.preventDefault();
    setActionError('');
    const items = [];
    for (const i of po.items) {
      const raw = received[i.itemId];
      if (raw === undefined || raw === '') continue;
      const quantity = Number(raw);
      if (!Number.isInteger(quantity) || quantity < 0) return setActionError(`${i.itemName}: enter a whole number.`);
      if (quantity > i.outstanding) return setActionError(`${i.itemName}: only ${i.outstanding} still outstanding.`);
      if (quantity > 0) items.push({ itemId: i.itemId, quantity });
    }
    if (items.length === 0) return setActionError('Enter the quantity received for at least one item.');
    setBusy(true);
    try {
      await api.post(`/purchase-orders/${id}/receipts`, { items });
      setReceived({});
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeOrder() {
    setActionError('');
    setBusy(true);
    try {
      await api.patch(`/purchase-orders/${id}/close`);
      reload();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DataState loading={loading} error={error}>
      {po && (
        <>
          <PageHeader title={`Purchase order ${po.poId}`} subtitle={<StatusChip status={po.status} />}>
            <Link to="/purchase-orders" className="btn btn-quiet">Back to purchase orders</Link>
            {user.role === ROLES.PROCUREMENT && po.status === 'delivered' && (
              <button type="button" className="btn" disabled={busy} onClick={closeOrder}>Close purchase order</button>
            )}
          </PageHeader>
          {actionError && <Notice kind="error">{actionError}</Notice>}

          <dl className="facts">
            <dt>Supplier</dt><dd><Link to={`/suppliers/${po.supplierId}`}>{po.supplier}</Link></dd>
            <dt>Requisition</dt><dd><Link to={`/requisitions/${po.requisitionId}`}>#{po.requisitionId}</Link></dd>
            <dt>Ordered</dt><dd>{formatDate(po.orderDate)} by {po.createdBy}</dd>
            <dt>Order total</dt><dd>{formatMoney(po.totalValue)}</dd>
          </dl>

          <section className="section">
            <h2>Items</h2>
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr><th>Item</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Outstanding</th><th className="num">Unit price</th><th className="num">Line total</th></tr>
                </thead>
                <tbody>
                  {po.items.map((i) => (
                    <tr key={i.itemId}>
                      <td>{i.itemName} <span className="muted">({i.unit})</span></td>
                      <td className="num">{i.quantityOrdered}</td><td className="num">{i.quantityReceived}</td><td className="num">{i.outstanding}</td>
                      <td className="num">{formatMoney(i.unitPrice)}</td><td className="num">{formatMoney(i.quantityOrdered * i.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {user.role === ROLES.STORE && po.status === 'ordered' && (
            <section className="section">
              <h2>Record goods received</h2>
              <p className="muted">Enter what arrived today. Part deliveries are fine. Received items are added to stock straight away.</p>
              <form onSubmit={recordReceipt} noValidate>
                <div className="inline-fields">
                  {po.items.filter((i) => i.outstanding > 0).map((i) => (
                    <Field key={i.itemId} label={`Received for ${i.itemName}`} hint={`${i.outstanding} still outstanding`}>
                      <input type="number" min="0" max={i.outstanding} step="1" value={received[i.itemId] ?? ''} onChange={(e) => setReceived({ ...received, [i.itemId]: e.target.value })} />
                    </Field>
                  ))}
                </div>
                <button type="submit" className="btn" disabled={busy} style={{ marginTop: 14 }}>Record receipt</button>
              </form>
            </section>
          )}

          <section className="section">
            <h2>Receipts</h2>
            {po.receipts.length === 0 ? <Empty title="No goods received yet." /> : (
              <div className="table-wrap">
                <table className="ledger">
                  <thead><tr><th>Receipt</th><th>Date</th><th>Received by</th><th>Items</th></tr></thead>
                  <tbody>
                    {po.receipts.map((r) => (
                      <tr key={r.receiptId}>
                        <td>{r.receiptId}</td><td>{formatDate(r.receivedDate)}</td><td>{r.receivedBy}</td>
                        <td>{r.items.map((x) => `${x.itemName}: ${x.quantityReceived}`).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </DataState>
  );
}
