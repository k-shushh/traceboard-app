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
} from 'lucide-react';
import { statuses, initials, type Task, type Member, type Project, type Status } from '../types';

type Props = {
  tasks: Task[];
  members: Member[];
  projects: Project[];
  onEdit: (t: Task) => void;
  onMove: (t: Task, s: Status, before?: string) => void;
  onCreate: (s: Status) => void;
  busy: boolean;
  showUndated?: boolean;
};
function Card({
  task,
  members,
  projects,
  onEdit,
  onMove,
  busy,
  overlay = false,
  showUndated = false,
}: Omit<Props, 'tasks' | 'onCreate'> & { task: Task; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: overlay ? `preview-${task.id}` : task.id,
    disabled: busy || overlay,
  });
  const owners = members.filter((m) => (task.assignee_ids || [task.assignee_id]).includes(m.id));
  const project = projects.find((p) => p.id === task.project_id);
  const Kind = task.kind === 'bug' ? Bug : task.kind === 'experiment' ? FlaskConical : Circle;
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task-card priority-${task.priority} ${isDragging ? 'dragging' : ''} ${overlay ? 'overlay' : ''}`}
      aria-label={`TB-${task.number}: ${task.title}, ${task.priority} priority`}
    >
      <div className="card-top">
        <span className="task-id">
          <Kind size={13} />
          TB-{String(task.number).padStart(3, '0')}
        </span>
        <div className="row">
          {task.private && <Lock size={12} aria-label="Private" />}
          <button
            {...attributes}
            {...listeners}
            className="drag-handle"
            aria-label={`Drag TB-${task.number}`}
            disabled={busy}
            title="Drag to move; keyboard: Space, arrows, Space"
          >
            <GripVertical size={17} />
          </button>
        </div>
      </div>
      <button className="card-title" onClick={() => onEdit(task)}>
        {task.title}
      </button>
      {task.description && <p className="card-description">{task.description}</p>}
      {task.deliverable_date && (
        <div className="card-date" title="Deliverable date">
          <CalendarDays size={12} />
          <time dateTime={task.deliverable_date}>
            {new Intl.DateTimeFormat(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }).format(new Date(`${task.deliverable_date}T12:00:00`))}
          </time>
        </div>
      )}
      {showUndated && !task.deliverable_date && (
        <div className="card-date">
          <CalendarDays size={12} />
          No deliverable date
        </div>
      )}
      <div className="card-footer">
        <span className="project-tag">
          {project?.name || (task.private ? 'Personal' : 'Workspace')}
        </span>
        <span
          className="assignee-avatars"
          aria-label={
            task.assign_all
              ? 'Assigned to everyone'
              : owners.map((m) => m.name).join(', ') || 'No assignee'
          }
        >
          {task.assign_all ? (
            <span className="avatar small" title="Assigned to everyone">
              <Users size={14} />
            </span>
          ) : owners.length ? (
            <>
              {owners.slice(0, 3).map((owner) => (
                <span key={owner.id} className="avatar small" title={owner.name}>
                  {initials(owner.name)}
                </span>
              ))}
              {owners.length > 3 && (
                <span
                  className="avatar small"
                  title={owners
                    .slice(3)
                    .map((m) => m.name)
                    .join(', ')}
                >
                  +{owners.length - 3}
                </span>
              )}
            </>
          ) : (
            <span className="avatar small" title="No assignee">
              —
            </span>
          )}
        </span>
      </div>
      <select
        className="card-status"
        aria-label={`Status of TB-${task.number}`}
        value={task.status}
        disabled={busy}
        onChange={(e) => onMove(task, e.target.value as Status)}
      >
        {statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </article>
  );
}
function Lane({
  status,
  children,
  count,
  onCreate,
}: {
  status: (typeof statuses)[number];
  children: React.ReactNode;
  count: number;
  onCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });
  return (
    <section className={`lane lane-${status.id} ${isOver ? 'over' : ''}`} ref={setNodeRef}>
      <div className="lane-heading">
        <span className={`status-dot ${status.id}`} />
        <h3>{status.label}</h3>
        <span className="count">{count}</span>
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
export function Board(props: Props) {
  const [active, setActive] = useState<Task | null>(null);
  const [mobileStatus, setMobileStatus] = useState<Status>('todo');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function finish(event: DragEndEvent) {
    setActive(null);
    const task = props.tasks.find((t) => t.id === event.active.id);
    if (!task || !event.over || event.active.id === event.over.id) return;
    const target = props.tasks.find((t) => t.id === event.over?.id);
    const status = target?.status || (event.over.id as Status);
    if (statuses.some((s) => s.id === status)) props.onMove(task, status, target?.id);
  }
  return (
    <>
      <div className="mobile-status-tabs">
        {statuses.map((s) => (
          <button
            key={s.id}
            className={mobileStatus === s.id ? 'active' : ''}
            onClick={() => setMobileStatus(s.id)}
          >
            {s.label}
            <span>{props.tasks.filter((t) => t.status === s.id).length}</span>
          </button>
        ))}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActive(props.tasks.find((t) => t.id === e.active.id) || null)}
        onDragEnd={finish}
        onDragCancel={() => setActive(null)}
      >
        <div className={`board mobile-${mobileStatus}`}>
          {statuses.map((status) => {
            const tasks = props.tasks.filter((t) => t.status === status.id);
            return (
              <Lane
                key={status.id}
                status={status}
                count={tasks.length}
                onCreate={() => props.onCreate(status.id)}
              >
                <SortableContext
                  items={tasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {tasks.map((task) => (
                    <Card key={task.id} {...props} task={task} />
                  ))}
                </SortableContext>
                {!tasks.length && (
                  <div className="lane-empty">
                    <p>No tasks</p>
                  </div>
                )}
              </Lane>
            );
          })}
        </div>
        <DragOverlay>{active && <Card {...props} task={active} overlay />}</DragOverlay>
      </DndContext>
    </>
  );
}
