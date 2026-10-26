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

export function dateBoardTasks(
  tasks: Task[],
  userId: string,
  date: string,
  today: string,
  includeOverdue: boolean,
  includeUndated: boolean,
) {
  const mine = tasks.filter(
    (task) =>
      task.assign_all ||
      (task.assignee_ids || [task.assignee_id]).includes(userId) ||
      (task.private && task.owner_id === userId),
  );
  return mine.filter(
    (task) =>
      task.deliverable_date === date ||
      (includeUndated && !task.deliverable_date) ||
      (includeOverdue &&
        task.status !== 'done' &&
        task.deliverable_date &&
        task.deliverable_date < today &&
        task.deliverable_date < date),
  );
}
