import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { ROLES, useAuth } from '../auth';
import { formatDate, formatMoney } from '../format';
import { DataState, Empty, Field, Modal, Notice, PageHeader, StatusChip, useLoad } from '../ui';
import { SupplierForm } from './Suppliers';

export default function SupplierDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = user.role === ROLES.PROCUREMENT;
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [priceItem, setPriceItem] = useState('');
  const [price, setPrice] = useState('');

  const { data, error, loading, reload } = useLoad(async () => {
    const [supplier, items] = await Promise.all([api.get(`/suppliers/${id}`), api.get('/items')]);
    return { supplier, items };
  }, [id]);

  async function toggleActive(s) {
    setActionError('');
    try {
      await api.patch(`/suppliers/${id}/active`, { isActive: !s.isActive });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function savePrice(e) {
    e.preventDefault();
    setActionError('');
    const value = Number(price);
    if (!priceItem || price === '' || !Number.isFinite(value) || value < 0) {
      return setActionError('Choose an item and enter a price of zero or more.');
    }
    try {
      await api.put(`/suppliers/${id}/items/${priceItem}`, { unitPrice: value });
      setPriceItem('');
      setPrice('');
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <DataState loading={loading} error={error}>
      {data && (() => {
        const { supplier: s, items } = data;
        return (
          <>
            <PageHeader title={s.supplierName} subtitle={<StatusChip status={s.isActive ? 'active' : 'inactive'} />}>
              <Link to="/suppliers" className="btn btn-quiet">Back to suppliers</Link>
              {canEdit && <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>Edit details</button>}
              {canEdit && <button type="button" className="btn btn-quiet" onClick={() => toggleActive(s)}>{s.isActive ? 'Deactivate' : 'Activate'}</button>}
            </PageHeader>
            {actionError && <Notice kind="error">{actionError}</Notice>}
            {!s.isActive && <Notice kind="warn">This supplier is inactive, so new purchase orders cannot be raised with it.</Notice>}

            <dl className="facts">
              <dt>Contact person</dt><dd>{s.contactPerson || <span className="muted">None</span>}</dd>
              <dt>Phone</dt><dd>{s.phone || <span className="muted">None</span>}</dd>
              <dt>Email</dt><dd>{s.email || <span className="muted">None</span>}</dd>
              <dt>Address</dt><dd>{s.address || <span className="muted">None</span>}</dd>
            </dl>

            <section className="section">
              <h2>Price list</h2>
              {s.items.length === 0 ? <Empty title="No prices recorded yet." /> : (
                <div className="table-wrap">
                  <table className="ledger">
                    <thead><tr><th>Item</th><th>Unit</th><th className="num">Unit price</th></tr></thead>
                    <tbody>
                      {s.items.map((i) => (
                        <tr key={i.itemId}><td>{i.itemName}</td><td>{i.unit}</td><td className="num">{formatMoney(i.unitPrice)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canEdit && (
                <form onSubmit={savePrice} className="inline-fields" style={{ marginTop: 16 }}>
                  <Field label="Item">
                    <select value={priceItem} onChange={(e) => setPriceItem(e.target.value)}>
                      <option value="">Choose an item</option>
                      {items.map((i) => <option key={i.itemId} value={i.itemId}>{i.itemName}</option>)}
                    </select>
                  </Field>
                  <Field label="Unit price (NGN)"><input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <button type="submit" className="btn">Save price</button>
                </form>
              )}
            </section>

            <section className="section">
              <h2>Past orders</h2>
              {s.orders.length === 0 ? <Empty title="No purchase orders with this supplier yet." /> : (
                <div className="table-wrap">
                  <table className="ledger">
                    <thead><tr><th>No.</th><th>Ordered</th><th className="num">Value</th><th>Status</th></tr></thead>
                    <tbody>
                      {s.orders.map((o) => (
                        <tr key={o.poId}>
                          <td><Link to={`/purchase-orders/${o.poId}`}>PO {o.poId}</Link></td>
                          <td>{formatDate(o.orderDate)}</td><td className="num">{formatMoney(o.totalValue)}</td><td><StatusChip status={o.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {editing && (
              <Modal title="Edit supplier" onClose={() => setEditing(false)}>
                <SupplierForm
                  initial={s}
                  submitLabel="Save changes"
                  onCancel={() => setEditing(false)}
                  onSubmit={async (body) => {
                    await api.put(`/suppliers/${id}`, body);
                    setEditing(false);
                    reload();
                  }}
                />
              </Modal>
            )}
          </>
        );
      })()}
    </DataState>
  );
}
