import { useEffect, useState } from 'react';
import { api } from '../api';
import { statuses, type Task } from '../types';

type Entry = {
  id: string;
  kind: 'comment' | 'event';
  body: string;
  author_name: string;
  created_at: string;
  converted_task_id: string | null;
  converted_task: Task | null;
};
type Activity = { entries: Entry[]; parent: Task | null; subtasks: Task[] };

export function TaskActivity({
  task,
  onOpen,
  onChanged,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [convert, setConvert] = useState<Entry | null>(null);
  const [title, setTitle] = useState('');
  async function load() {
    setData(await api<Activity>(`/tasks/${task.id}/activity`));
  }
  useEffect(() => {
    let active = true;
    api<Activity>(`/tasks/${task.id}/activity`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [task.id]);
  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api(`/tasks/${task.id}/comments`, 'POST', { body });
      setBody('');
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!convert || busy) return;
    setBusy(true);
    setError('');
    try {
      await api<Task>(`/tasks/${task.id}/comments/${convert.id}/subtask`, 'POST', { title });
      setConvert(null);
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const taskLink = (item: Task) => (
    <button type="button" className="task-link" disabled={busy} onClick={() => onOpen(item)}>
      TB-{String(item.number).padStart(3, '0')} · {item.title}
      <span className="tag">{statuses.find((s) => s.id === item.status)?.label}</span>
    </button>
  );
  return (
    <section className="task-activity" aria-label="Comments and activity">
      {data?.parent && (
        <div className="task-relations">
          <h3>Parent task</h3>
          {taskLink(data.parent)}
        </div>
      )}
      {!!data?.subtasks.length && (
        <div className="task-relations">
          <h3>Subtasks ({data.subtasks.length})</h3>
          {data.subtasks.map((child) => (
            <div key={child.id}>{taskLink(child)}</div>
          ))}
        </div>
      )}
      <div className="row spread">
        <h3>Comments & activity</h3>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setError('');
            void load().catch((e) => setError(e.message));
          }}
        >
          Refresh updates
        </button>
      </div>
      <p className="muted small-text">
        Document progress, decisions, and follow-ups. Turn a comment into a linked subtask.
      </p>
      {!data && !error && <p role="status">Loading updates…</p>}
      {data && !data.entries.length && (
        <p className="muted">No updates yet. Add the first comment.</p>
      )}
      <ol className="activity-list">
        {data?.entries.map((entry) => (
          <li key={entry.id} className={`activity-${entry.kind}`}>
            <div className="activity-meta">
              <strong>{entry.author_name}</strong>
              <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
              {entry.kind === 'event' && <span>Activity</span>}
            </div>
            <p>{entry.body}</p>
            {entry.converted_task ? (
              taskLink(entry.converted_task)
            ) : entry.converted_task_id ? (
              <small className="muted">Linked subtask was deleted.</small>
            ) : (
              entry.kind === 'comment' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConvert(entry);
                    setTitle(entry.body.split('\n')[0].slice(0, 200));
                  }}
                >
                  Create subtask
                </button>
              )
            )}
          </li>
        ))}
      </ol>
      {convert && (
        <form className="comment-convert" onSubmit={createSubtask}>
          <label>
            Subtask title
            <input
              autoFocus
              required
              maxLength={200}
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <p className="muted small-text">
            The full comment becomes its description. Project, visibility, priority, and assignees
            follow the parent.
          </p>
          <div className="row">
            <button type="button" disabled={busy} onClick={() => setConvert(null)}>
              Cancel subtask
            </button>
            <button className="primary" disabled={busy || !title.trim()}>
              {busy ? 'Creating…' : 'Create linked subtask'}
            </button>
          </div>
        </form>
      )}
      <form onSubmit={postComment} className="comment-composer">
        <label>
          Add a comment
          <textarea
            aria-label="Add a comment"
            required
            maxLength={10000}
            rows={3}
            value={body}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What changed? Add an update or @mention a teammate…"
          />
        </label>
        <button className="primary" disabled={busy || !body.trim()}>
          {busy ? 'Working…' : 'Post comment'}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
