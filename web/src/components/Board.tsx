import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Plus,
  Bug,
  FlaskConical,
  Circle,
  Lock,
  CalendarDays,
  Users,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  Eye,
  EyeOff,
  Pencil,
} from 'lucide-react';
import { statuses, initials, type Task, type Member, type Project, type Status } from '../types';
import { dateLabel, localDateValue } from '../agenda';
import { isTaskHidden, visibleBoardTasks } from '../boardVisibility';
import type { BoardView } from '../useBoardPreferences';

export type BoardProps = {
  tasks: Task[];
  members: Member[];
  projects: Project[];
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: Status, before?: string) => void;
  onCreate: (status: Status) => void;
  busy: boolean;
  view: BoardView;
  showUndated?: boolean;
};

function Card({
  task,
  members,
  projects,
  onEdit,
  onMove,
  busy,
  view,
  expanded,
  onToggle,
  overlay = false,
  showUndated = false,
}: Omit<BoardProps, 'tasks' | 'onCreate'> & {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: overlay ? `preview-${task.id}` : task.id,
    disabled: busy || overlay,
  });
  const owners = members.filter((member) =>
    (task.assignee_ids || [task.assignee_id]).includes(member.id),
  );
  const project = projects.find((item) => item.id === task.project_id);
  const Kind = task.kind === 'bug' ? Bug : task.kind === 'experiment' ? FlaskConical : Circle;
  const hidden = isTaskHidden(task, view.value);
  const overdue =
    task.status !== 'done' && task.deliverable_date && task.deliverable_date < localDateValue();
  const detailId = `task-details-${overlay ? 'overlay-' : ''}${task.id}`;
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task-card compact-task priority-${task.priority} ${isDragging ? 'dragging' : ''} ${overlay ? 'overlay' : ''} ${hidden ? 'hidden-task' : ''}`}
      aria-label={`TB-${task.number}: ${task.title}, ${task.priority} priority`}
    >
      <div className="card-top">
        <span className="task-id">
          <Kind size={13} />
          TB-{String(task.number).padStart(3, '0')}
        </span>
        <div className="row card-tools">
          <span className="card-priority">{hidden ? 'Hidden' : task.priority}</span>
          {task.private && <Lock size={12} aria-label="Private" />}
          <button
            {...attributes}
            {...listeners}
            className="drag-handle"
            aria-label={`Drag TB-${task.number}`}
            disabled={busy}
            title="Drag to move; keyboard: Space, arrows, Space"
          >
            <GripVertical size={16} />
          </button>
        </div>
      </div>
      <button
        className="card-title card-expand"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span>{task.title}</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <div className="compact-card-meta">
        <span className="project-tag">
          {project?.name || (task.private ? 'Personal' : 'Workspace')}
        </span>
        {(task.deliverable_date || showUndated) && (
          <span className={`compact-date ${overdue ? 'overdue' : ''}`}>
            <CalendarDays size={11} />
            {overdue && 'Overdue · '}
            {task.deliverable_date ? dateLabel(task.deliverable_date) : 'No date'}
          </span>
        )}
        <span
          className="assignee-avatars"
          aria-label={
            task.assign_all
              ? 'Assigned to everyone'
              : owners.map((member) => member.name).join(', ') || 'No assignee'
          }
        >
          {task.assign_all ? (
            <span className="avatar small" title="Everyone">
              <Users size={13} />
            </span>
          ) : owners.length ? (
            <>
              {owners.slice(0, 2).map((owner) => (
                <span key={owner.id} className="avatar small" title={owner.name}>
                  {initials(owner.name)}
                </span>
              ))}
              {owners.length > 2 && <span className="avatar small">+{owners.length - 2}</span>}
            </>
          ) : (
            <span className="avatar small" title="No assignee">
              —
            </span>
          )}
        </span>
      </div>
      <div id={detailId} className="expanded-card-details" hidden={!expanded}>
        {task.description && <p className="card-description">{task.description}</p>}
        <div className="card-owner-detail">
          <span>Assigned to</span>
          <span>
            {task.assign_all
              ? 'Everyone'
              : owners.map((owner) => owner.name).join(', ') || 'Unassigned'}
          </span>
        </div>
        <label className="card-status-label">
          Status
          <select
            className="card-status"
            aria-label={`Status of TB-${task.number}`}
            value={task.status}
            disabled={busy}
            onChange={(e) => onMove(task, e.target.value as Status)}
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <div className="card-detail-actions">
          <button onClick={() => onEdit(task)} disabled={busy}>
            <Pencil size={13} />
            Edit task
          </button>
          {task.status === 'done' && (
            <button onClick={() => view.toggleTask(task)}>
              {hidden ? <Eye size={13} /> : <EyeOff size={13} />}
              {hidden ? 'Restore task' : 'Hide this task'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Lane({
  status,
  children,
  count,
  hiddenCount,
  onCreate,
}: {
  status: (typeof statuses)[number];
  children: React.ReactNode;
  count: number;
  hiddenCount: number;
  onCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <section
      className={`lane lane-${status.id} ${isOver ? 'over' : ''}`}
      aria-label={`${status.label} tasks`}
      ref={setNodeRef}
    >
      <div className="lane-heading">
        <span className={`status-dot ${status.id}`} />
        <h3>{status.label}</h3>
        <span className="count">{count}</span>
        {hiddenCount > 0 && <span className="lane-hidden-count">{hiddenCount} hidden</span>}
        <button
          className="icon-button"
          aria-label={`Add task to ${status.label}`}
          onClick={onCreate}
        >
          <Plus size={17} />
        </button>
      </div>
      {children}
      <button className="add-card" onClick={onCreate}>
        <Plus size={15} />
        Add task
      </button>
    </section>
  );
}

export function Board(props: BoardProps) {
  const [active, setActive] = useState<Task | null>(null);
  const [mobileStatus, setMobileStatus] = useState<Status>('todo');
  const [expanded, setExpanded] = useState<string[]>([]);
  const visible = visibleBoardTasks(props.tasks, props.view.value, props.view.showHidden);
  const hiddenCount = props.tasks.filter((task) => isTaskHidden(task, props.view.value)).length;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function finish(event: DragEndEvent) {
    setActive(null);
    const task = visible.find((item) => item.id === event.active.id);
    if (!task || !event.over || event.active.id === event.over.id) return;
    const target = visible.find((item) => item.id === event.over?.id);
    const status = target?.status || (event.over.id as Status);
    if (statuses.some((item) => item.id === status)) props.onMove(task, status, target?.id);
  }
  function toggle(id: string) {
    setExpanded((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  }
  return (
    <>
      <div className="board-view-controls">
        <button onClick={() => setExpanded([])}>
          <ChevronsDownUp size={15} />
          Collapse all
        </button>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={props.view.value.hideDone}
            onChange={(e) => props.view.setHideDone(e.target.checked)}
          />
          Hide done
        </label>
        {(hiddenCount > 0 || props.view.showHidden) && (
          <button
            aria-pressed={props.view.showHidden}
            onClick={() => props.view.setShowHidden(!props.view.showHidden)}
          >
            <Eye size={15} />
            {props.view.showHidden ? 'Stop showing hidden' : `Show hidden (${hiddenCount})`}
          </button>
        )}
        <span className="board-visible-count" role="status">
          {visible.length} shown
        </span>
      </div>
      <div className="mobile-status-tabs">
        {statuses.map((status) => (
          <button
            key={status.id}
            className={mobileStatus === status.id ? 'active' : ''}
            onClick={() => setMobileStatus(status.id)}
          >
            {status.label}
            <span>{visible.filter((task) => task.status === status.id).length}</span>
          </button>
        ))}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(event) =>
          setActive(visible.find((task) => task.id === event.active.id) || null)
        }
        onDragEnd={finish}
        onDragCancel={() => setActive(null)}
      >
        <div className={`board mobile-${mobileStatus}`}>
          {statuses.map((status) => {
            const tasks = visible.filter((task) => task.status === status.id);
            const hidden =
              props.tasks.filter((task) => task.status === status.id).length - tasks.length;
            return (
              <Lane
                key={status.id}
                status={status}
                count={tasks.length}
                hiddenCount={hidden}
                onCreate={() => props.onCreate(status.id)}
              >
                <SortableContext
                  items={tasks.map((task) => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {tasks.map((task) => (
                    <Card
                      key={task.id}
                      {...props}
                      task={task}
                      expanded={expanded.includes(task.id)}
                      onToggle={() => toggle(task.id)}
                    />
                  ))}
                </SortableContext>
                {!tasks.length && (
                  <div className="lane-empty">
                    <p>{hidden ? 'Completed tasks are hidden.' : 'No tasks in this view.'}</p>
                    {hidden > 0 && (
                      <button onClick={() => props.view.setShowHidden(true)}>Show completed</button>
                    )}
                  </div>
                )}
              </Lane>
            );
          })}
        </div>
        <DragOverlay>
          {active && <Card {...props} task={active} overlay expanded={false} onToggle={() => {}} />}
        </DragOverlay>
      </DndContext>
      <p className="board-visibility-note">
        Hidden tasks stay in the project and completion history. This view is saved for your account
        in this browser.
      </p>
    </>
  );
}
