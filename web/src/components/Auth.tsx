import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Layers3, Moon, Sun } from 'lucide-react';
import { api } from '../api';
import type { User } from '../types';

export function Auth({
  onLogin,
  theme,
  toggleTheme,
}: {
  onLogin: (user: User) => void;
  theme: string;
  toggleTheme: () => void;
}) {
  const invite = new URLSearchParams(location.search).get('invite');
  const [register, setRegister] = useState(Boolean(invite));
  const [admin, setAdmin] = useState(false);
  const [reset, setReset] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (reset) {
        const result = await api<{ message: string }>('/auth/password-reset-request', 'POST', {
          phone: data.identifier,
        });
        setMessage(result.message);
        return;
      }
      const user = await api<User>(`/auth/${register ? 'register' : 'login'}`, 'POST', {
        ...data,
        ...(register ? { invite } : { mode: admin ? 'admin' : 'team' }),
      });
      history.replaceState(null, '', '/');
      onLogin(user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <Layers3 size={24} />
          </span>
          traceboard<span className="brand-dot">.</span>
        </div>
      </section>
      <section className="auth-form-panel">
        <button
          className="theme-corner icon-button"
          aria-label="Toggle color theme"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </button>
        <div className="auth-form">
          <h2>
            {reset
              ? 'Reset password'
              : admin
                ? 'Admin sign in'
                : register
                  ? invite
                    ? 'Join your team.'
                    : 'Create workspace'
                  : 'Sign in'}
          </h2>
          {!register && !reset && (
            <div className="auth-modes">
              <button
                className={!admin ? 'active' : ''}
                onClick={() => {
                  setAdmin(false);
                  setError('');
                }}
              >
                Team login
              </button>
              <button
                className={admin ? 'active' : ''}
                onClick={() => {
                  setAdmin(true);
                  setError('');
                }}
              >
                Admin login
              </button>
            </div>
          )}
          <p className="muted">
            {register
              ? invite
                ? 'Use the email address your invitation was sent to.'
                : 'Create your account and your team’s workspace.'
              : reset
                ? 'Your admin will verify the request and provide a temporary password.'
                : ''}
          </p>
          <form onSubmit={submit}>
            {register && (
              <>
                <label>
                  Your name
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Alex Morgan"
                  />
                </label>
                <label>
                  Mention handle
                  <input
                    name="handle"
                    required
                    pattern="[a-z][a-z0-9_]{2,29}"
                    placeholder="alex"
                    autoCapitalize="none"
                  />
                  <small>Lowercase letters, numbers, underscores. Used as @alex.</small>
                </label>
              </>
            )}
            <label>
              {register ? 'Email address' : admin ? 'Username' : 'Phone number'}
              <input
                name={register ? 'email' : 'identifier'}
                type={register ? 'email' : 'text'}
                inputMode={!register && !admin ? 'tel' : undefined}
                required
                autoComplete={register ? 'email' : 'username'}
                placeholder={register ? 'you@yourteam.com' : admin ? 'admin' : '+91 phone number'}
              />
            </label>
            {!reset && (
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={register ? 12 : 1}
                  maxLength={128}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder={register ? 'At least 12 characters' : 'Your password'}
                />
              </label>
            )}
            {register && !invite && (
              <label>
                Workspace name
                <input
                  name="workspace"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Your AI team"
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? 'One moment…'
                : register
                  ? invite
                    ? 'Join workspace'
                    : 'Create workspace'
                  : reset
                    ? 'Request reset'
                    : 'Sign in'}
              <ArrowUpRight size={18} />
            </button>
          </form>
          {message && (
            <p className="muted" role="status">
              {message}
            </p>
          )}
          <p className="auth-switch">
            <button
              onClick={() => {
                setReset(register ? false : !reset);
                setRegister(false);
                setAdmin(false);
                setError('');
                setMessage('');
              }}
            >
              {reset || register ? 'Back to sign in' : 'Reset password'}
            </button>
          </p>
          <div className="local-note">
            <span className="live-dot" /> Team workspace · Secure sign-in
          </div>
        </div>
      </section>
    </div>
  );
}
