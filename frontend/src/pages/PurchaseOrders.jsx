import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { capitalise, formatDate, formatMoney } from '../format';
import { DataState, Empty, PageHeader, StatusChip, useLoad } from '../ui';

const STATUSES = ['ordered', 'delivered', 'closed'];

export default function PurchaseOrders() {
  const [status, setStatus] = useState('');
  const { data, error, loading } = useLoad(() => api.get('/purchase-orders' + (status ? `?status=${status}` : '')), [status]);

  return (
    <>
      <PageHeader title="Purchase orders" subtitle="Orders are raised from approved requisitions, on the requisition page." />
      <div className="inline-fields" style={{ marginBottom: 16, maxWidth: 260 }}>
        <div className="field">
          <label>
            <span className="field-label">Show</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{capitalise(s)}</option>)}
            </select>
          </label>
        </div>
      </div>
      <DataState loading={loading} error={error}>
        {data && data.length === 0 ? (
          <Empty title={status ? `No ${status} purchase orders.` : 'No purchase orders yet.'} />
        ) : (
          data && (
            <div className="table-wrap">
              <table className="ledger">
                <thead><tr><th>No.</th><th>Requisition</th><th>Supplier</th><th>Ordered</th><th className="num">Value</th><th>Status</th></tr></thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.poId}>
                      <td><Link to={`/purchase-orders/${p.poId}`}>PO {p.poId}</Link></td>
                      <td><Link to={`/requisitions/${p.requisitionId}`}>#{p.requisitionId}</Link></td>
                      <td>{p.supplier}</td><td>{formatDate(p.orderDate)}</td>
                      <td className="num">{formatMoney(p.totalValue)}</td><td><StatusChip status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </DataState>
    </>
  );
}
