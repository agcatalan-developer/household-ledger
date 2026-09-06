import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../lib/api';
import { login } from '../hooks/useAuth';

export function LoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/summary', { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 429) {
        setError('Too many attempts. Try again in a few minutes.');
      } else {
        setError('Email or password is not right.');
      }
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="screen" style={{ paddingTop: 64 }}>
        <h1>Household Ledger</h1>
        <form onSubmit={submit} className="card">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <div className="inline-error">{error}</div>}
          <button className="btn block" type="submit" disabled={busy} style={{ marginTop: 16 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
