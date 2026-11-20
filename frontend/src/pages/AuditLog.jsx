import { useState } from 'react';
import { api } from '../api';
import { formatDateTime } from '../format';
import { DataState, Empty, Field, PageHeader, useLoad } from '../ui';

export default function AuditLog() {
  const [action, setAction] = useState('');
  const { data, error, loading } = useLoad(() => api.get(`/audit-log?limit=200${action ? `&action=${encodeURIComponent(action)}` : ''}`), [action]);
  const { data: all } = useLoad(() => api.get('/audit-log?limit=500'), []);
  const actions = all ? [...new Set(all.map((a) => a.action))].sort() : [];

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every important action, newest first. Showing up to 200 entries." />
      <div className="inline-fields" style={{ marginBottom: 16, maxWidth: 320 }}>
        <Field label="Action">
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a.replaceAll('_', ' ').toLowerCase()}</option>)}
          </select>
        </Field>
      </div>
      <DataState loading={loading} error={error}>
        {data && data.length === 0 ? <Empty title="No entries match." /> : (
          data && (
            <div className="table-wrap">
              <table className="ledger">
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.logId}>
                      <td>{formatDateTime(a.loggedAt)}</td><td>{a.userName || <span className="muted">Unknown</span>}</td>
                      <td>{a.action.replaceAll('_', ' ').toLowerCase()}</td>
                      <td>{a.tableName}{a.recordId ? ` #${a.recordId}` : ''}</td>
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
