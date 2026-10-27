import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { TaskActivity } from './TaskActivity';
import { Select } from './Select';
import { AssigneeSelect } from './AssigneeSelect';
import { AlignLeft, CalendarDays, Circle, Flag, Folder, Lock, Tag, Users } from 'lucide-react';
import {
  priorities,
  statuses,
  type Task,
  type TaskInput,
  type User,
  type Member,
  type Project,
  type Status,
} from '../types';
import { api } from '../api';

export function TaskDialog({
  task,
  status = 'todo',
  projectId,
  user,
  members,
  projects,
  onClose,
  onSaved,
  onOpen,
  onChanged,
}: {
  task?: Task;
  status?: Status;
  projectId: string;
  user: User;
  members: Member[];
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
  onOpen: (task: Task) => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<TaskInput>(
    task
      ? {
          title: task.title,
          deliverable_date: task.deliverable_date,
          description: task.description,
          priority: task.priority,
          status: task.status,
          kind: task.kind,
          assignee_id: null,
          assignee_ids: task.assignee_ids || (task.assignee_id ? [task.assignee_id] : []),
          assign_all: task.assign_all,
          project_id: task.project_id,
          private: task.private,
          source_note_id: task.source_note_id,
        }
      : {
          title: '',
          deliverable_date: null,
          description: '',
          priority: 'normal',
          status,
          kind: 'task',
          assignee_id: null,
          assignee_ids: [user.id],
          assign_all: false,
          project_id: projectId || null,
          private: false,
          source_note_id: null,
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function remove() {
    if (!task || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`/tasks/${task.id}`, 'DELETE', { version: task.version });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const change = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) =>
    setForm((old) => ({ ...old, [key]: value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(task ? `/tasks/${task.id}` : '/tasks', task ? 'PUT' : 'POST', {
        ...form,
        ...(task ? { version: task.version } : {}),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={task ? `TB-${String(task.number).padStart(3, '0')} · Task details` : 'New task'}
      className="task-modal"
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={save} className="task-editor">
        <div className="task-writing">
          <label className="task-title-label">
            <span>Task title</span>
            <input
              autoFocus
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => change('title', e.target.value)}
              placeholder="What needs to get done?"
            />
          </label>
          <label className="task-description-label">
            <span>
              <AlignLeft size={14} /> Description
            </span>
            <textarea
              rows={3}
              maxLength={10000}
              value={form.description}
              onChange={(e) => change('description', e.target.value)}
              placeholder="Add details or @mention a teammate…"
            />
          </label>
          {!form.private && members.some((m) => m.id !== user.id) && (
            <div className="mention-chips">
              {members
                .filter((m) => m.id !== user.id)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      change(
                        'description',
                        `${form.description}${form.description ? ' ' : ''}@${m.handle} `,
                      )
                    }
                  >
                    @{m.handle}
                  </button>
                ))}
            </div>
          )}
        </div>
        <div className="task-properties">
          <div className="property-field">
            <span>
              <Circle size={14} /> Status
            </span>
            <Select
              label="Status"
              value={form.status}
              onChange={(v) => change('status', v as Status)}
              options={statuses.map((s) => ({ value: s.id, label: s.label }))}
            />
          </div>
          <div className="property-field">
            <span>
              <Flag size={14} /> Priority
            </span>
            <Select
              label="Priority"
              value={form.priority}
              onChange={(v) => change('priority', v as Task['priority'])}
              options={priorities.map((p) => ({
                value: p,
                label: p[0].toUpperCase() + p.slice(1),
                color: p,
              }))}
            />
          </div>
          <div className="property-field">
            <span>
              <Users size={14} /> Assignee
            </span>
            <AssigneeSelect
              label="Assignee"
              members={members.filter((m) => !form.private || m.id === user.id)}
              ids={form.assignee_ids}
              all={form.assign_all}
              privateTask={form.private}
              onChange={(ids, all) =>
                setForm((old) => ({
                  ...old,
                  assignee_ids: ids,
                  assignee_id: null,
                  assign_all: all,
                }))
              }
            />
          </div>
          <div className="property-field">
            <span>
              <CalendarDays size={14} /> Deliverable date <small>Optional</small>
            </span>
            <input
              aria-label="Deliverable date (optional)"
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={form.deliverable_date || ''}
              onInput={(e) => change('deliverable_date', e.currentTarget.value || null)}
              onChange={(e) => change('deliverable_date', e.target.value || null)}
            />
          </div>
          <div className="property-field">
            <span>
              <Folder size={14} /> Project
            </span>
            <Select
              label="Project"
              value={form.project_id || ''}
              onChange={(v) => change('project_id', v || null)}
              options={[
                { value: '', label: 'No project' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          <div className="property-field">
            <span>
              <Tag size={14} /> Type
            </span>
            <Select
              label="Type"
              value={form.kind}
              onChange={(v) => change('kind', v as Task['kind'])}
              options={[
                { value: 'task', label: 'Task' },
                { value: 'bug', label: 'Bug' },
                { value: 'experiment', label: 'Experiment' },
              ]}
            />
          </div>
        </div>
        <div className="task-editor-footer">
          <div className="task-visibility">
            <Lock size={13} />
            <Select
              label="Visibility"
              disabled={Boolean(task)}
              value={String(form.private)}
              onChange={(v) =>
                setForm((old) => ({
                  ...old,
                  private: v === 'true',
                  assignee_id: null,
                  assignee_ids: [user.id],
                  assign_all: false,
                }))
              }
              options={[
                { value: 'false', label: 'Team workspace' },
                { value: 'true', label: 'Only me' },
              ]}
            />
          </div>
          <div className="row">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
        {form.assign_all && <p className="task-form-note">One shared task for the whole team.</p>}
        {form.source_note_id && <p className="task-form-note">Created from a project note.</p>}
        {error && (
          <p className="error task-form-note" role="alert">
            {error}
          </p>
        )}
      </form>
      {task && (
        <>
          <TaskActivity task={task} onOpen={onOpen} onChanged={onChanged} />
          <div className="task-delete-area">
            {confirmDelete ? (
              <div role="alert">
                <h3>Delete this {task.kind}?</h3>
                <p>
                  “{task.title}” and its comments will no longer be available on the board. Subtasks
                  will remain as standalone tasks. This cannot be undone in the app.
                </p>
                <div className="row">
                  <button disabled={busy} onClick={() => setConfirmDelete(false)}>
                    Keep item
                  </button>
                  <button className="danger" disabled={busy} onClick={() => void remove()}>
                    {busy ? 'Deleting…' : 'Confirm delete'}
                  </button>
                </div>
              </div>
            ) : (
              <button className="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                Delete {task.kind}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
