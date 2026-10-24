import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDashed,
  Users,
} from 'lucide-react';
import { buildAgenda, dateLabel, localDateValue } from '../agenda';
import { statuses, type Task, type Project, type User } from '../types';

export function MyBoard({
  tasks,
  user,
  projects,
  onEdit,
}: {
  tasks: Task[];
  user: User;
  projects: Project[];
  onEdit: (task: Task) => void;
}) {
  const today = localDateValue();
  const [through, setThrough] = useState(today);
  const [showCompleted, setShowCompleted] = useState(true);
  const agenda = useMemo(
    () => buildAgenda(tasks, user.id, through, today, showCompleted),
    [tasks, user.id, through, today, showCompleted],
  );
  function shift(days: number) {
    const date = new Date(`${through}T12:00:00`);
    date.setDate(date.getDate() + days);
    const value = localDateValue(date);
    if (value >= '0001-01-01' && value <= '9999-12-31') setThrough(value);
  }
  function cards(items: Task[]) {
    return items.map((task) => (
      <button
        className={`agenda-task priority-${task.priority}`}
        key={task.id}
        onClick={() => onEdit(task)}
        aria-label={`TB-${task.number}: ${task.title}, ${task.priority} priority, ${statuses.find((s) => s.id === task.status)?.label}`}
      >
        <span className={`agenda-state-icon ${task.status}`}>
          {task.status === 'done' ? (
            <Check size={16} />
          ) : task.status === 'progress' ? (
            <CircleDashed size={16} />
          ) : (
            <Circle size={16} />
          )}
        </span>
        <span className="agenda-task-copy">
          <span className="agenda-title">{task.title}</span>
          <span className="agenda-meta">
            <span>TB-{String(task.number).padStart(3, '0')}</span>
            <span>
              {projects.find((project) => project.id === task.project_id)?.name ||
                (task.private ? 'Private' : 'Workspace')}
            </span>
            {task.assign_all && (
              <span className="agenda-team">
                <Users size={11} />
                Everyone
              </span>
            )}
          </span>
        </span>
        <span className={`agenda-status ${task.status}`}>
          {statuses.find((s) => s.id === task.status)?.label}
        </span>
      </button>
    ));
  }
  function groups(items: { date: string; tasks: Task[] }[]) {
    return items.map((group) => (
      <div className="agenda-day" key={group.date}>
        <h3>
          <CalendarDays size={14} />
          <time dateTime={group.date}>{dateLabel(group.date)}</time>
          <span className="count">{group.tasks.length}</span>
        </h3>
        <div className="agenda-cards">{cards(group.tasks)}</div>
      </div>
    ));
  }
  return (
    <section className="agenda">
      <div className="agenda-toolbar">
        <label>
          Through date
          <input
            type="date"
            value={through}
            min="0001-01-01"
            max="9999-12-31"
            onInput={(event) => {
              if (event.currentTarget.value) setThrough(event.currentTarget.value);
            }}
            onChange={(event) => {
              if (event.target.value) setThrough(event.target.value);
            }}
          />
        </label>
        <div className="row agenda-date-buttons">
          <button className="icon-button" aria-label="Previous day" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => setThrough(today)}>Today</button>
          <button className="icon-button" aria-label="Next day" onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
          />
          Show completed
        </label>
      </div>
      <div className="agenda-summary">
        <span className="agenda-total">
          <strong>{agenda.pending}</strong> pending
        </span>
        <span className="agenda-cutoff">Through {dateLabel(through)}</span>
        <span className="agenda-later">{agenda.later} due later</span>
      </div>
      <div className="agenda-columns">
        <section className="agenda-section" aria-label="Scheduled tasks">
          <h2>
            Scheduled{' '}
            <span className="count">
              {agenda.scheduled.reduce((sum, group) => sum + group.tasks.length, 0)}
            </span>
          </h2>
          {agenda.scheduled.length ? (
            groups(agenda.scheduled)
          ) : (
            <p className="muted">No scheduled tasks through this date.</p>
          )}
        </section>
        <section className="agenda-section" aria-label="Unscheduled tasks">
          <h2>
            Unscheduled <span className="count">{agenda.unscheduled.length}</span>
          </h2>
          {agenda.unscheduled.length ? (
            <div className="agenda-cards">{cards(agenda.unscheduled)}</div>
          ) : (
            <p className="muted">No undated tasks.</p>
          )}
        </section>
        <section className="agenda-section" aria-label="Overdue tasks">
          <h2>
            Overdue{' '}
            <span className="count">
              {agenda.overdue.reduce((sum, group) => sum + group.tasks.length, 0)}
            </span>
          </h2>
          {agenda.overdue.length ? (
            groups(agenda.overdue)
          ) : (
            <p className="muted">No overdue tasks through this date.</p>
          )}
        </section>
      </div>
    </section>
  );
}
