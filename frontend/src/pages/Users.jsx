import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { DataState, Field, Modal, Notice, PageHeader, StatusChip, useLoad } from '../ui';

function UserForm({ user, roles, departments, onSubmit, onCancel }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    username: user?.username || '',
    password: '',
    roleId: user ? String(user.roleId) : '',
    departmentId: user?.departmentId ? String(user.departmentId) : '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) return setError('Enter the full name.');
    if (!form.roleId) return setError('Choose a role.');
    if (!editing && !form.username.trim()) return setError('Enter a username.');
    if ((!editing || form.password) && form.password.length < 8) return setError('The password must be at least 8 characters.');
    setBusy(true);
    try {
      const body = { fullName: form.fullName.trim(), roleId: Number(form.roleId), departmentId: form.departmentId ? Number(form.departmentId) : null };
      if (form.password) body.password = form.password;
      if (!editing) body.username = form.username.trim();
      await onSubmit(body);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <Notice kind="error">{error}</Notice>}
      <Field label="Full name"><input type="text" value={form.fullName} onChange={set('fullName')} /></Field>
      {!editing && <Field label="Username"><input type="text" value={form.username} onChange={set('username')} autoComplete="off" /></Field>}
      <Field label={editing ? 'New password' : 'Password'} hint={editing ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}>
        <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <div className="inline-fields">
        <Field label="Role">
          <select value={form.roleId} onChange={set('roleId')}>
            <option value="">Choose a role</option>
            {roles.map((r) => <option key={r.roleId} value={r.roleId}>{r.roleName}</option>)}
          </select>
        </Field>
        <Field label="Department" hint="Requesters need a department.">
          <select value={form.departmentId} onChange={set('departmentId')}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.departmentId} value={d.departmentId}>{d.departmentName}</option>)}
          </select>
        </Field>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn" disabled={busy}>{editing ? 'Save changes' : 'Create user'}</button>
      </div>
    </form>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [modal, setModal] = useState(null); // 'new' | user object
  const [actionError, setActionError] = useState('');
  const { data, error, loading, reload } = useLoad(async () => {
    const [users, roles, departments] = await Promise.all([api.get('/users'), api.get('/roles'), api.get('/departments')]);
    return { users, roles, departments };
  }, []);

  async function toggle(u) {
    setActionError('');
    try {
      await api.patch(`/users/${u.userId}/active`, { isActive: !u.isActive });
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <>
      <PageHeader title="Users" subtitle="Accounts are deactivated, never deleted, so the history stays complete.">
        <button type="button" className="btn" onClick={() => setModal('new')}>Add user</button>
      </PageHeader>
      {actionError && <Notice kind="error">{actionError}</Notice>}
      <DataState loading={loading} error={error}>
        {data && (
          <>
            <div className="table-wrap">
              <table className="ledger">
                <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Department</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.userId}>
                      <td>{u.fullName}</td><td>{u.username}</td><td>{u.role}</td>
                      <td>{u.department || <span className="muted">None</span>}</td>
                      <td><StatusChip status={u.isActive ? 'active' : 'inactive'} /></td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setModal(u)} aria-label={`Edit ${u.fullName}`}>Edit</button>
                          {u.userId !== me.userId && (
                            <button type="button" className="btn btn-quiet btn-sm" onClick={() => toggle(u)} aria-label={`${u.isActive ? 'Deactivate' : 'Activate'} ${u.fullName}`}>
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {modal && (
              <Modal title={modal === 'new' ? 'Add user' : `Edit ${modal.fullName}`} onClose={() => setModal(null)}>
                <UserForm
                  user={modal === 'new' ? null : modal}
                  roles={data.roles}
                  departments={data.departments}
                  onCancel={() => setModal(null)}
                  onSubmit={async (body) => {
                    if (modal === 'new') await api.post('/users', body);
                    else await api.put(`/users/${modal.userId}`, body);
                    setModal(null);
                    reload();
                  }}
                />
              </Modal>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
