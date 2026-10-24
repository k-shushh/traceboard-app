import type { Task } from './types';

// Date-only ISO values compare chronologically without converting to UTC.
export function localDateValue(date = new Date()): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

export function buildAgenda(
  tasks: Task[],
  userId: string,
  through: string,
  today: string,
  showCompleted: boolean,
) {
  const mine = tasks.filter(
    (task) =>
      task.assign_all ||
      (task.assignee_ids || [task.assignee_id]).includes(userId) ||
      (task.private && task.owner_id === userId),
  );
  const dated = mine.filter((task) => task.deliverable_date && task.deliverable_date <= through);
  const pending = dated.filter((task) => task.status !== 'done');
  const overdue = pending.filter((task) => task.deliverable_date! < today);
  const overdueIds = new Set(overdue.map((task) => task.id));
  const scheduled = dated.filter(
    (task) => !overdueIds.has(task.id) && (showCompleted || task.status !== 'done'),
  );
  const unscheduled = mine.filter(
    (task) => !task.deliverable_date && (showCompleted || task.status !== 'done'),
  );
  const group = (items: Task[]) =>
    [...new Set(items.map((task) => task.deliverable_date!))].sort().map((date) => ({
      date,
      tasks: items
        .filter((task) => task.deliverable_date === date)
        .sort((a, b) => a.number - b.number),
    }));
  return {
    pending: pending.length,
    overdue: group(overdue),
    scheduled: group(scheduled),
    unscheduled,
    later: mine.filter(
      (task) => task.deliverable_date && task.deliverable_date > through && task.status !== 'done',
    ).length,
  };
}
