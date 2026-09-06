import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { invalidateEverything, keys } from '../lib/queries';
import { logout, useMe } from '../hooks/useAuth';
import { todayLocal } from '../lib/date';
import type { Category, CategoryType } from '../lib/types';

const TYPES: CategoryType[] = ['expense', 'income', 'savings'];

export function SettingsScreen() {
  const me = useMe();
  const navigate = useNavigate();
  const cats = useQuery({
    queryKey: keys.categories,
    queryFn: () => api<{ categories: Category[] }>('/categories'),
  });

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CategoryType>('expense');
  const [displayName, setDisplayName] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState('');

  const list = cats.data?.categories ?? [];

  async function rename(c: Category) {
    const name = window.prompt('Rename category', c.name);
    if (!name || name === c.name) return;
    await api(`/categories/${c.id}`, { method: 'PATCH', body: { name } });
    invalidateEverything();
  }

  async function toggleArchive(c: Category) {
    await api(`/categories/${c.id}`, {
      method: 'PATCH',
      body: { archivedAt: c.archivedAt ? null : todayLocal() },
    });
    invalidateEverything();
  }

  async function move(type: CategoryType, index: number, delta: number) {
    const inType = list.filter((c) => c.type === type).sort((a, b) => a.sortOrder - b.sortOrder);
    const target = index + delta;
    if (target < 0 || target >= inType.length) return;
    const reordered = [...inType];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item!);
    const payload = reordered.map((c, i) => ({ id: c.id, sortOrder: (i + 1) * 10 + baseFor(type) }));
    await api('/categories/order', { method: 'PUT', body: payload });
    invalidateEverything();
  }

  async function createCategory() {
    if (!newName.trim()) return;
    await api('/categories', { method: 'POST', body: { name: newName.trim(), type: newType } });
    setNewName('');
    invalidateEverything();
  }

  async function saveHouseholdName(name: string) {
    if (!name || name === me.data?.household.name) return;
    await api('/household', { method: 'PATCH', body: { name } });
    invalidateEverything();
  }

  async function changeCurrency() {
    const currency = window.prompt(
      'New currency code. Amounts are stored as numbers, not converted — changing to USD re-labels ₱1,240 as $1,240.',
      me.data?.household.currency,
    );
    if (!currency) return;
    await api('/household', { method: 'PATCH', body: { currency } });
    invalidateEverything();
  }

  async function saveProfile() {
    setMsg('');
    try {
      const body: Record<string, unknown> = {};
      if (displayName.trim()) body.displayName = displayName.trim();
      if (newPw) {
        body.password = newPw;
        body.currentPassword = currentPw;
      }
      await api('/profile', { method: 'PATCH', body });
      setNewPw('');
      setCurrentPw('');
      setDisplayName('');
      setMsg('Saved. Other devices stay signed in.');
      invalidateEverything();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <div className="screen">
      <h1>Settings</h1>

      <div className="card">
        <h2>Categories</h2>
        {TYPES.map((type) => {
          const inType = list
            .filter((c) => c.type === type)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          if (inType.length === 0) return null;
          return (
            <div key={type} style={{ marginBottom: 12 }}>
              <div className="day-divider">{type}</div>
              {inType.map((c, i) => (
                <div key={c.id} className="row">
                  <span className={c.archivedAt ? 'secondary' : 'primary'}>
                    {c.name}
                    {c.archivedAt && <span className="badge">archived</span>}
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost" onClick={() => move(type, i, -1)}>
                      ↑
                    </button>
                    <button className="btn ghost" onClick={() => move(type, i, 1)}>
                      ↓
                    </button>
                    <button className="btn ghost" onClick={() => rename(c)}>
                      Rename
                    </button>
                    <button className="btn ghost" onClick={() => toggleArchive(c)}>
                      {c.archivedAt ? 'Unarchive' : 'Archive'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          );
        })}
        <div className="filters" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="New category"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value as CategoryType)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button className="btn" onClick={createCategory}>
            Add
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Household</h2>
        <label htmlFor="hn">Name</label>
        <input
          id="hn"
          type="text"
          defaultValue={me.data?.household.name}
          onBlur={(e) => saveHouseholdName(e.target.value)}
        />
        <button className="btn secondary" style={{ marginTop: 12 }} onClick={changeCurrency}>
          Currency: {me.data?.household.currency}
        </button>
        <div className="day-divider">Members</div>
        {(me.data?.household.members ?? []).map((m) => (
          <div key={m.id} className="row">
            <span>{m.displayName}</span>
            <span className="secondary">{m.role}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Profile</h2>
        <label htmlFor="dn">Display name</label>
        <input
          id="dn"
          type="text"
          placeholder={me.data?.displayName}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <label htmlFor="cp">Current password</label>
        <input id="cp" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
        <label htmlFor="np">New password</label>
        <input id="np" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        <p className="secondary">Changing your password will not sign you out on other devices.</p>
        {msg && <div className="inline-error">{msg}</div>}
        <button className="btn block" style={{ marginTop: 8 }} onClick={saveProfile}>
          Save
        </button>
        <button
          className="btn ghost block"
          style={{ marginTop: 8 }}
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function baseFor(type: CategoryType): number {
  return type === 'expense' ? 0 : type === 'income' ? 100 : 200;
}
