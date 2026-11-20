import { Link } from 'react-router-dom';
import { api } from '../api';
import { ROLES, useAuth } from '../auth';
import { formatDate, formatDateTime, formatMoney } from '../format';
import { DataState, Empty, PageHeader, StatusChip, useLoad } from '../ui';

function Queue({ title, count, empty, children }) {
  return (
    <section className="section">
      <h2>
        {title}
        {count !== undefined && <span className="count">{count}</span>}
      </h2>
      {count === 0 ? <Empty title={empty} /> : children}
    </section>
  );
}

function RequisitionRows({ rows, showRequester = true }) {
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead>
          <tr>
            <th>No.</th>
            {showRequester && <th>Requested by</th>}
            <th>Department</th>
            <th className="num">Items</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.requisitionId}>
              <td><Link to={`/requisitions/${r.requisitionId}`}>#{r.requisitionId}</Link></td>
              {showRequester && <td>{r.requestedBy}</td>}
              <td>{r.department}</td>
              <td className="num">{r.itemCount}</td>
              <td>{formatDate(r.createdAt)}</td>
              <td><StatusChip status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseOrderRows({ rows }) {
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead>
          <tr><th>No.</th><th>Supplier</th><th>Ordered</th><th className="num">Value</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.poId}>
              <td><Link to={`/purchase-orders/${p.poId}`}>PO {p.poId}</Link></td>
              <td>{p.supplier}</td>
              <td>{formatDate(p.orderDate)}</td>
              <td className="num">{formatMoney(p.totalValue)}</td>
              <td><StatusChip status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LowStockRows({ rows }) {
  return (
    <div className="table-wrap">
      <table className="ledger">
        <thead>
          <tr><th>Item</th><th className="num">In stock</th><th className="num">Reorder level</th></tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.itemId}>
              <td>{i.itemName}</td>
              <td className="num">{i.quantityInStock} {i.unit}</td>
              <td className="num">{i.reorderLevel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequesterHome() {
  const { data, error, loading } = useLoad(() => api.get('/requisitions'), []);
  return (
    <DataState loading={loading} error={error}>
      {data && (
        <>
          <Queue title="Waiting for you to confirm" count={data.filter((r) => r.status === 'delivered').length} empty="Nothing to confirm right now.">
            <RequisitionRows rows={data.filter((r) => r.status === 'delivered')} showRequester={false} />
          </Queue>
          <Queue title="Your recent requisitions" count={data.length} empty="You have not raised a requisition yet. Choose New requisition in the menu to start.">
            <RequisitionRows rows={data.slice(0, 6)} showRequester={false} />
            {data.length > 6 && <p className="muted" style={{ marginTop: 8 }}><Link to="/requisitions">See all {data.length}</Link></p>}
          </Queue>
        </>
      )}
    </DataState>
  );
}

function ProcurementHome() {
  const { data, error, loading } = useLoad(async () => {
    const [submitted, approved, orders, low] = await Promise.all([
      api.get('/requisitions?status=submitted'),
      api.get('/requisitions?status=approved'),
      api.get('/purchase-orders?status=ordered'),
      api.get('/inventory/stock?lowOnly=true'),
    ]);
    return { submitted, approved, orders, low };
  }, []);
  return (
    <DataState loading={loading} error={error}>
      {data && (
        <>
          <Queue title="Waiting for your decision" count={data.submitted.length} empty="No requisitions are waiting for a decision.">
            <RequisitionRows rows={data.submitted} />
          </Queue>
          <Queue title="Approved, needs a purchase order or stock issue" count={data.approved.length} empty="No approved requisitions are waiting.">
            <RequisitionRows rows={data.approved} />
          </Queue>
          <Queue title="Purchase orders waiting for goods" count={data.orders.length} empty="No purchase orders are waiting for delivery.">
            <PurchaseOrderRows rows={data.orders} />
          </Queue>
          <Queue title="Items at or below reorder level" count={data.low.length} empty="All items are above their reorder level.">
            <LowStockRows rows={data.low} />
          </Queue>
        </>
      )}
    </DataState>
  );
}

function StoreHome() {
  const { data, error, loading } = useLoad(async () => {
    const [approved, orders, low] = await Promise.all([
      api.get('/requisitions?status=approved'),
      api.get('/purchase-orders?status=ordered'),
      api.get('/inventory/stock?lowOnly=true'),
    ]);
    return { approved, orders, low };
  }, []);
  return (
    <DataState loading={loading} error={error}>
      {data && (
        <>
          <Queue title="Approved, ready to check and issue" count={data.approved.length} empty="No approved requisitions are waiting.">
            <RequisitionRows rows={data.approved} />
          </Queue>
          <Queue title="Purchase orders waiting for goods" count={data.orders.length} empty="No purchase orders are waiting for delivery.">
            <PurchaseOrderRows rows={data.orders} />
          </Queue>
          <Queue title="Items at or below reorder level" count={data.low.length} empty="All items are above their reorder level.">
            <LowStockRows rows={data.low} />
          </Queue>
        </>
      )}
    </DataState>
  );
}

function AdminHome() {
  const { data, error, loading } = useLoad(async () => {
    const [users, audit] = await Promise.all([api.get('/users'), api.get('/audit-log?limit=8')]);
    return { users, audit };
  }, []);
  return (
    <DataState loading={loading} error={error}>
      {data && (
        <>
          <section className="section">
            <h2>Accounts</h2>
            <p>
              {data.users.filter((u) => u.isActive).length} active and {data.users.filter((u) => !u.isActive).length} deactivated.{' '}
              <Link to="/users">Manage users</Link>
            </p>
          </section>
          <Queue title="Latest activity" count={data.audit.length} empty="Nothing has been recorded yet.">
            <div className="table-wrap">
              <table className="ledger">
                <thead><tr><th>When</th><th>Who</th><th>Action</th></tr></thead>
                <tbody>
                  {data.audit.map((a) => (
                    <tr key={a.logId}>
                      <td>{formatDateTime(a.loggedAt)}</td>
                      <td>{a.userName || 'Unknown'}</td>
                      <td>{a.action.replaceAll('_', ' ').toLowerCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 8 }}><Link to="/audit-log">Open the full audit log</Link></p>
          </Queue>
        </>
      )}
    </DataState>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const body = {
    [ROLES.REQUESTER]: <RequesterHome />,
    [ROLES.PROCUREMENT]: <ProcurementHome />,
    [ROLES.STORE]: <StoreHome />,
    [ROLES.ADMIN]: <AdminHome />,
  }[user.role];

  return (
    <>
      <PageHeader title="Home" subtitle={`Signed in as ${user.fullName}, ${user.role}.`} />
      {body}
    </>
  );
}
