import { useState, type FormEvent } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Modal } from './Modal';
import { api } from '../api';
import type { User } from '../types';

export function EditProfile({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(await api<User>('/auth/me', 'PATCH', { name }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (changingPassword)
    return <ChangePassword onBack={() => setChangingPassword(false)} onClose={onClose} />;
  return (
    <Modal title="Edit profile" onClose={onClose}>
      <form className="modal-body" onSubmit={save}>
        <label>
          Display name
          <input
            autoFocus
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label>
          {user.phone ? 'Phone number' : 'Email'}
          <input readOnly value={user.phone || user.email} />
        </label>
        <label>
          Mention handle
          <input readOnly value={`@${user.handle}`} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={() => setChangingPassword(true)}>
            Change password
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ChangePassword({
  onBack,
  onClose,
  requiredChange = false,
  onUpdated,
}: {
  onBack: () => void;
  onClose: () => void;
  requiredChange?: boolean;
  onUpdated?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get('new_password') !== data.get('confirm_password')) {
      setError('The new passwords do not match.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api('/auth/password', 'POST', {
        current_password: data.get('current_password'),
        new_password: data.get('new_password'),
      });
      form.reset();
      if (requiredChange) onUpdated?.();
      else setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={requiredChange ? 'Set a new password' : 'Change password'} onClose={onClose}>
      {saved ? (
        <div className="modal-body">
          <p role="status">Password changed. Other sessions have been signed out.</p>
          <button className="primary" onClick={onBack}>
            Back to profile
          </button>
        </div>
      ) : (
        <form className="modal-body" onSubmit={submit}>
          <label>
            {requiredChange ? 'Temporary password' : 'Current password'}
            <input
              name="current_password"
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <label>
            New password
            <input
              name="new_password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
            <small>At least 12 characters.</small>
          </label>
          <label>
            Confirm new password
            <input
              name="confirm_password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" onClick={onBack} disabled={busy}>
              {requiredChange ? 'Sign out' : 'Back'}
            </button>
            <button className="primary" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function SettingsDialog({
  theme,
  onTheme,
  onClose,
}: {
  theme: string;
  onTheme: (theme: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="modal-body">
        <h3>Appearance</h3>
        <div className="theme-options">
          <button
            aria-pressed={theme === 'light'}
            className={theme === 'light' ? 'selected' : ''}
            onClick={() => onTheme('light')}
          >
            <Sun size={20} />
            Light
          </button>
          <button
            aria-pressed={theme === 'dark'}
            className={theme === 'dark' ? 'selected' : ''}
            onClick={() => onTheme('dark')}
          >
            <Moon size={20} />
            Dark
          </button>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
