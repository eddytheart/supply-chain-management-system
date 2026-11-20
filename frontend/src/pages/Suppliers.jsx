import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ROLES, useAuth } from '../auth';
import { DataState, Empty, Field, Modal, Notice, PageHeader, StatusChip, useLoad } from '../ui';

export function SupplierForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({ supplierName: '', contactPerson: '', phone: '', email: '', address: '', ...initial });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.supplierName.trim()) return setError('Enter the supplier name.');
    setBusy(true);
    try {
      await onSubmit({
        supplierName: form.supplierName.trim(),
        contactPerson: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <Notice kind="error">{error}</Notice>}
      <Field label="Supplier name"><input type="text" value={form.supplierName} onChange={set('supplierName')} /></Field>
      <Field label="Contact person"><input type="text" value={form.contactPerson || ''} onChange={set('contactPerson')} /></Field>
      <div className="inline-fields">
        <Field label="Phone"><input type="text" value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input type="email" value={form.email || ''} onChange={set('email')} /></Field>
      </div>
      <Field label="Address"><input type="text" value={form.address || ''} onChange={set('address')} /></Field>
      <div className="dialog-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}

export default function Suppliers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const { data, error, loading } = useLoad(() => api.get('/suppliers'), []);
  const canEdit = user.role === ROLES.PROCUREMENT;

  return (
    <>
      <PageHeader title="Suppliers">
        {canEdit && <button type="button" className="btn" onClick={() => setAdding(true)}>Add supplier</button>}
      </PageHeader>
      <DataState loading={loading} error={error}>
        {data && data.length === 0 ? (
          <Empty title="No suppliers yet.">{canEdit && 'Choose Add supplier to create the first one.'}</Empty>
        ) : (
          data && (
            <div className="table-wrap">
              <table className="ledger">
                <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>Status</th></tr></thead>
                <tbody>
                  {data.map((s) => (
                    <tr key={s.supplierId}>
                      <td><Link to={`/suppliers/${s.supplierId}`}>{s.supplierName}</Link></td>
                      <td>{s.contactPerson || <span className="muted">None</span>}</td>
                      <td>{s.phone || <span className="muted">None</span>}</td>
                      <td><StatusChip status={s.isActive ? 'active' : 'inactive'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </DataState>
      {adding && (
        <Modal title="Add supplier" onClose={() => setAdding(false)}>
          <SupplierForm
            submitLabel="Add supplier"
            onCancel={() => setAdding(false)}
            onSubmit={async (body) => {
              const res = await api.post('/suppliers', body);
              navigate(`/suppliers/${res.supplierId}`);
            }}
          />
        </Modal>
      )}
    </>
  );
}
