import { useEffect, useState } from 'react';
import { CheckCheck, Activity, CircleDashed, Sparkles, ArrowUpRight } from 'lucide-react';
import { api } from '../api';
import { Modal } from './Modal';
import type { Scope } from '../types';
type Insight = {
  buckets: { label: string; count: number }[];
  completed: number;
  previous: number;
  in_progress: number;
  todo: number;
  recent: { id: string; number: number; title: string; at: string }[];
  timezone: string;
  method: string;
};
export function Insights({
  scope,
  projectId,
  revision,
  onTask,
}: {
  scope: Scope;
  projectId: string;
  revision: string;
  onTask: (id: string) => void;
}) {
  const [period, setPeriod] = useState('weekly');
  const [data, setData] = useState<Insight | null>(null);
  const [error, setError] = useState('');
  const [recap, setRecap] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError('');
    const query = new URLSearchParams({
      scope,
      period,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(projectId ? { project_id: projectId } : {}),
    });
    api<Insight>(`/insights?${query}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [scope, period, projectId, revision]);
  async function generateRecap() {
    setAiBusy(true);
    setAiError('');
    try {
      const result = await api<{ summary: string }>('/ai/recap', 'POST', {
        scope,
        period,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(projectId ? { project_id: projectId } : {}),
      });
      setAiSummary(result.summary);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  const label = period === 'daily' ? 'today' : period === 'weekly' ? 'this week' : 'this month';
  return (
    <div className="insights">
      <div className="row spread">
        <div className="segmented">
          {['daily', 'weekly', 'monthly'].map((p) => (
            <button
              key={p}
              aria-pressed={p === period}
              className={period === p ? 'active' : ''}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setAiSummary('');
            setAiError('');
            setRecap(true);
          }}
          disabled={!data}
        >
          <Sparkles size={16} />
          Write a recap
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p className="muted">Loading insights…</p>}
      {data && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <span>
                <CheckCheck size={18} />
                Completed {label}
              </span>
              <strong>{data.completed}</strong>
              <small>
                {data.previous} in the previous{' '}
                {period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}
              </small>
            </div>
            <div className="metric">
              <span>
                <Activity size={18} />
                In progress now
              </span>
              <strong>{data.in_progress}</strong>
            </div>
            <div className="metric">
              <span>
                <CircleDashed size={18} />
                Still to do
              </span>
              <strong>{data.todo}</strong>
            </div>
          </div>
          <div className="chart-panel">
            <div className="row spread">
              <div>
                <h3>Task completions</h3>
                <p className="muted">
                  Unique tasks completed per{' '}
                  {period === 'daily' ? 'day' : period === 'weekly' ? 'week' : 'month'}.
                </p>
              </div>
              <span className="tag">{scope === 'team' ? 'Team' : 'Personal'}</span>
            </div>
            <div
              className="chart"
              role="img"
              aria-label={data.buckets.map((b) => `${b.label}: ${b.count} completed`).join(', ')}
            >
              {data.buckets.map((b, i) => (
                <div className="bar-column" key={b.label}>
                  <span>{b.count}</span>
                  <div
                    className={`bar ${i === data.buckets.length - 1 ? 'current' : ''}`}
                    style={{
                      height: `${Math.max(3, (b.count / Math.max(1, ...data.buckets.map((x) => x.count))) * 130)}px`,
                    }}
                  />
                  <small>{b.label}</small>
                </div>
              ))}
            </div>
            <p className="chart-caption">
              {data.method} · {data.timezone}
            </p>
          </div>
          <div className="recent-panel">
            <h3>Finished {label}</h3>
            {data.recent.length ? (
              data.recent.map((t) => (
                <button key={t.id} className="recent-task" onClick={() => onTask(t.id)}>
                  <CheckCheck size={17} />
                  <span className="task-id">TB-{t.number}</span>
                  <strong>{t.title}</strong>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <p className="muted">No completed tasks in this period.</p>
            )}
          </div>
          {recap && (
            <Modal title={`Your ${period.replace('ly', '')} recap`} onClose={() => setRecap(false)}>
              <div className="modal-body recap">
                <span className="eyebrow">{scope === 'team' ? 'TEAM' : 'PERSONAL'} PROGRESS</span>
                <h3>
                  {data.completed
                    ? `${data.completed} task${data.completed === 1 ? '' : 's'} completed ${label}.`
                    : `No tasks completed ${label}.`}
                </h3>
                <p>
                  {data.in_progress} task{data.in_progress === 1 ? ' is' : 's are'} in progress,
                  with {data.todo} still to do.
                </p>
                {data.recent.length > 0 && (
                  <>
                    <h4>Completed tasks</h4>
                    <ul>
                      {data.recent.slice(0, 5).map((t) => (
                        <li key={t.id}>
                          TB-{t.number} · {t.title}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="muted small-text">
                  Generate with Groq sends these activity counts and up to 20 completed task titles
                  to Groq. Review the generated summary for accuracy.
                </p>
                <button onClick={() => void generateRecap()} disabled={aiBusy}>
                  {aiBusy ? 'Generating…' : 'Generate with Groq'}
                </button>
                {aiError && (
                  <p className="error" role="alert">
                    {aiError}
                  </p>
                )}
                {aiSummary && <p style={{ whiteSpace: 'pre-wrap' }}>{aiSummary}</p>}
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
