import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ROLES, useAuth } from '../auth';
import { capitalise, formatDate } from '../format';
import { DataState, Empty, PageHeader, StatusChip, useLoad } from '../ui';

const STATUSES = ['submitted', 'approved', 'rejected', 'ordered', 'delivered', 'closed'];

export default function Requisitions() {
  const { user } = useAuth();
  const isRequester = user.role === ROLES.REQUESTER;
  const [status, setStatus] = useState('');
  const { data, error, loading } = useLoad(() => api.get('/requisitions' + (status ? `?status=${status}` : '')), [status]);

  return (
    <>
      <PageHeader title={isRequester ? 'My requisitions' : 'Requisitions'}>
        {isRequester && <Link to="/requisitions/new" className="btn">New requisition</Link>}
      </PageHeader>

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
          <Empty title={status ? `No ${status} requisitions.` : 'No requisitions yet.'}>
            {isRequester && !status && 'Choose New requisition to raise your first one.'}
          </Empty>
        ) : (
          data && (
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>No.</th>
                    {!isRequester && <th>Requested by</th>}
                    <th>Department</th>
                    <th>Reason</th>
                    <th className="num">Items</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.requisitionId}>
                      <td><Link to={`/requisitions/${r.requisitionId}`}>#{r.requisitionId}</Link></td>
                      {!isRequester && <td>{r.requestedBy}</td>}
                      <td>{r.department}</td>
                      <td>{r.reason || <span className="muted">No reason given</span>}</td>
                      <td className="num">{r.itemCount}</td>
                      <td>{formatDate(r.createdAt)}</td>
                      <td><StatusChip status={r.status} /></td>
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
