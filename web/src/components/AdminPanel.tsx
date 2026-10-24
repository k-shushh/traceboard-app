import { useEffect, useState } from 'react';
import { api } from '../api';
import { Modal } from './Modal';

type ResetRequest = { user_id: string; name: string; phone: string; requested_at: string };
export function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    name: string;
    temporary_password: string;
    expires_at: string;
  } | null>(null);
  async function refresh() {
    try {
      setRequests(await api<ResetRequest[]>('/auth/password-resets'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function approve(request: ResetRequest) {
    setBusy(true);
    setError('');
    try {
      setResult(await api(`/auth/password-resets/${request.user_id}/approve`, 'POST', {}));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-panel">
      <header className="row spread">
        <h1>Traceboard admin</h1>
        <button onClick={onLogout}>Sign out</button>
      </header>
      <section>
        <div className="row spread">
          <h2>Password reset requests</h2>
          <button onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
        {requests.length > 0 && (
          <p className="muted">Confirm each request directly with the teammate before approving.</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!requests.length && <p className="muted">No pending requests.</p>}
        {requests.map((request) => (
          <div className="reset-request" key={request.user_id}>
            <div>
              <strong>{request.name}</strong>
              <p className="muted">{request.phone}</p>
              <small>{new Date(request.requested_at).toLocaleString()}</small>
            </div>
            <button className="primary" disabled={busy} onClick={() => void approve(request)}>
              Approve reset
            </button>
          </div>
        ))}
      </section>
      {result && (
        <Modal title={`Password reset · ${result.name}`} onClose={() => setResult(null)}>
          <div className="modal-body">
            <label>
              Temporary password
              <input readOnly value={result.temporary_password} />
            </label>
            <p className="muted">
              Share this directly with {result.name}. It expires in 24 hours and must be changed
              before opening the workspace.
            </p>
            <button className="primary" onClick={() => setResult(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
