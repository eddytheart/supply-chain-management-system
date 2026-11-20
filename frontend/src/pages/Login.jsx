import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Field, Notice } from '../ui';

const SAMPLE = [
  ['Requester', 'requester', 'Request@12345'],
  ['Procurement Officer', 'procurement', 'Procure@12345'],
  ['Store Officer', 'store', 'Store@12345'],
  ['Administrator', 'admin', 'Admin@12345'],
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-side">
        <h1>Central Stores and Procurement</h1>
        <p>
          Raise and track requisitions, manage suppliers and purchase orders, and keep an accurate record of stock for the University of Ibadan.
        </p>
      </section>
      <section className="login-form">
        <h2>Sign in</h2>
        {error && <Notice kind="error">{error}</Notice>}
        <form onSubmit={onSubmit}>
          <Field label="Username">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {import.meta.env.DEV && (
          <details className="sample">
            <summary>Sample accounts (development only)</summary>
            <table>
              <tbody>
                {SAMPLE.map(([role, u, p]) => (
                  <tr key={u}>
                    <td>{role}</td>
                    <td>{u}</td>
                    <td>{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </div>
  );
}
