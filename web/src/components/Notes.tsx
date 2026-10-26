import { AssigneeSelect } from './AssigneeSelect';
import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  FileText,
  Plus,
  Lock,
  ArrowUpRight,
  Bold,
  Italic,
  List,
  Heading2,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';
import { Modal } from './Modal';
import {
  priorities,
  type Note,
  type Member,
  type Project,
  type Priority,
  type User,
} from '../types';

export function Notes({
  notes,
  projects,
  onOpen,
}: {
  notes: Note[];
  projects: Project[];
  onOpen: (note?: Note) => void;
}) {
  return (
    <div className="notes-grid">
      <button className="new-note" onClick={() => onOpen()}>
        <Plus size={25} />
        <strong>New note</strong>
      </button>
      {notes.map((note) => (
        <button key={note.id} className="note-card" onClick={() => onOpen(note)}>
          <div className="row spread">
            <span className="note-icon">
              <FileText size={21} />
            </span>
            {note.private ? <Lock size={14} /> : <ArrowUpRight size={17} />}
          </div>
          <h3>{note.title}</h3>
          <p>{note.plain_text || 'Empty note'}</p>
          <footer>
            <span>{projects.find((p) => p.id === note.project_id)?.name || 'Workspace'}</span>
            <span>
              {new Date(note.updated_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </footer>
        </button>
      ))}
    </div>
  );
}
type Draft = {
  title: string;
  priority: Priority;
  assignee_id: string | null;
  assignee_ids?: string[];
  assign_all?: boolean;
  selected: boolean;
};
export function NoteEditor({
  note,
  projectId,
  members,
  projects,
  user,
  onClose,
  onSaved,
  onTasks,
}: {
  note?: Note;
  projectId: string;
  members: Member[];
  projects: Project[];
  user: User;
  onClose: () => void;
  onSaved: () => void;
  onTasks: (count: number) => void;
}) {
  const [saved, setSaved] = useState(note);
  const [title, setTitle] = useState(note?.title || '');
  const [project, setProject] = useState(note?.project_id || projectId);
  const [privateNote, setPrivate] = useState(note?.private || false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [draftMethod, setDraftMethod] = useState('');
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false })],
    content: note?.content || { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: { 'aria-label': 'Note content', role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: () => setDirty(true),
  });
  function close() {
    if (!dirty || window.confirm('Discard your unsaved note changes?')) onClose();
  }
  async function save() {
    if (!title.trim()) {
      setError('Give your note a title.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<Note>(
        saved ? `/notes/${saved.id}` : '/notes',
        saved ? 'PUT' : 'POST',
        {
          title,
          content: editor?.getJSON(),
          project_id: project || null,
          private: privateNote,
          ...(saved ? { version: saved.version } : {}),
        },
      );
      setSaved(result);
      setDirty(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function suggest(useAI = true) {
    if (!saved) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{
        drafts: Omit<Draft, 'selected'>[];
        version: number;
        method: string;
      }>(
        useAI ? `/ai/notes/${saved.id}/drafts` : `/notes/${saved.id}/drafts`,
        useAI ? 'POST' : 'GET',
        useAI ? {} : undefined,
      );
      if (result.version !== saved.version)
        throw new Error('This note changed. Reopen it before generating tasks.');
      setDraftMethod(result.method);
      setDrafts(result.drafts.map((d) => ({ ...d, selected: true })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function convert() {
    if (!saved || !drafts) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ created: unknown[]; skipped: number }>(
        `/notes/${saved.id}/tasks`,
        'POST',
        {
          version: saved.version,
          drafts: drafts.filter((d) => d.selected).map(({ selected, ...rest }) => rest),
        },
      );
      setDrafts(null);
      onTasks(result.created.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal wide title={saved ? 'Project note' : 'New note'} onClose={close}>
      <div className="modal-body note-editor">
        <input
          className="note-title-input"
          aria-label="Note title"
          placeholder="Note title"
          maxLength={200}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
        />
        <div className="form-grid">
          <label>
            Project
            <select
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibility
            <select
              disabled={Boolean(saved)}
              value={String(privateNote)}
              onChange={(e) => {
                setPrivate(e.target.value === 'true');
                setDirty(true);
              }}
            >
              <option value="false">Team workspace</option>
              <option value="true">Only me</option>
            </select>
          </label>
        </div>
        <div className="editor-shell">
          <div className="editor-toolbar">
            <button
              title="Bold"
              aria-label="Bold"
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold size={17} />
            </button>
            <button
              title="Italic"
              aria-label="Italic"
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic size={17} />
            </button>
            <button
              title="Heading"
              aria-label="Heading"
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 size={18} />
            </button>
            <button
              title="Bullet list"
              aria-label="Bullet list"
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List size={18} />
            </button>
            <span className="toolbar-divider" />
            <select
              aria-label="Mention teammate in note"
              value=""
              disabled={privateNote}
              onChange={(e) => {
                if (e.target.value)
                  editor?.chain().focus().insertContent(`@${e.target.value} `).run();
              }}
            >
              <option value="">@ Mention</option>
              {members
                .filter((m) => m.id !== user.id)
                .map((m) => (
                  <option key={m.id} value={m.handle}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>
          <EditorContent editor={editor} />
        </div>
        <p className="muted small-text">
          Write naturally or use a numbered list. Save your note, then let Groq suggest tasks for
          you to review and create.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="muted small-text">
          Find tasks with Groq sends this saved note to Groq. Tasks are created after your review.
        </p>
        <button
          className="primary"
          disabled={busy || dirty || !saved}
          onClick={() => void suggest()}
          title={dirty ? 'Save your changes first' : 'Generate task suggestions with Groq'}
        >
          <Sparkles size={16} /> Find tasks with Groq
        </button>
        <div className="modal-actions spread">
          <button
            disabled={busy || dirty || !saved}
            onClick={() => void suggest(false)}
            title={
              dirty ? 'Save your changes first' : 'Use local rules without sending the note to Groq'
            }
          >
            <Sparkles size={16} />
            Use local suggestions instead
          </button>
          <div className="row">
            <span className="muted small-text">
              {dirty ? 'Unsaved changes' : saved ? 'Saved' : 'New note'}
            </span>
            <button className="primary" onClick={save} disabled={busy}>
              {busy ? 'Working…' : 'Save note'}
            </button>
          </div>
        </div>
      </div>
      {drafts !== null && (
        <Modal title="Review task suggestions" onClose={() => setDrafts(null)} wide>
          <div className="modal-body">
            <p className="muted">Review and edit before creating tasks. {draftMethod}</p>
            {!drafts.length && (
              <div className="empty-state">
                <Sparkles />
                <h3>No task suggestions found</h3>
                <p>
                  Describe what needs to change or add a numbered action list, then save and try
                  again.
                </p>
              </div>
            )}
            {drafts.map((draft, i) => (
              <div className="draft-row" key={i}>
                <input
                  aria-label={`Include suggestion ${i + 1}`}
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(e) =>
                    setDrafts((old) =>
                      old!.map((d, j) => (j === i ? { ...d, selected: e.target.checked } : d)),
                    )
                  }
                />
                <div>
                  <input
                    aria-label={`Suggested task ${i + 1}`}
                    value={draft.title}
                    maxLength={200}
                    onChange={(e) =>
                      setDrafts((old) =>
                        old!.map((d, j) => (j === i ? { ...d, title: e.target.value } : d)),
                      )
                    }
                  />
                  <div className="form-grid">
                    <select
                      aria-label={`Priority for suggestion ${i + 1}`}
                      value={draft.priority}
                      onChange={(e) =>
                        setDrafts((old) =>
                          old!.map((d, j) =>
                            j === i ? { ...d, priority: e.target.value as Priority } : d,
                          ),
                        )
                      }
                    >
                      {priorities.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    <AssigneeSelect
                      label={`Assignee for suggestion ${i + 1}`}
                      members={members}
                      privateTask={privateNote}
                      ids={draft.assignee_ids || (draft.assignee_id ? [draft.assignee_id] : [])}
                      all={draft.assign_all || false}
                      onChange={(ids, all) =>
                        setDrafts((old) =>
                          old!.map((d, j) =>
                            j === i
                              ? { ...d, assignee_id: null, assignee_ids: ids, assign_all: all }
                              : d,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button onClick={() => setDrafts(null)}>Back to note</button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !drafts.some((d) => d.selected) ||
                  drafts.some((d) => d.selected && !d.title.trim())
                }
                onClick={convert}
              >
                Create selected tasks
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
