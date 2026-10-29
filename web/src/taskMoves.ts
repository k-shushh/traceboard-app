import type { Status, Task } from './types';

/** Keep the displayed order independent of the server's position renumbering. */
export function placeTask(tasks: Task[], task: Task, status: Status, before?: string): Task[] {
  const remaining = tasks.filter((item) => item.id !== task.id);
  let index = before
    ? remaining.findIndex((item) => item.id === before && item.status === status)
    : -1;
  if (index < 0) {
    index = remaining.reduce(
      (last, item, i) => (item.status === status ? i + 1 : last),
      remaining.length,
    );
  }
  remaining.splice(index, 0, { ...task, status });
  return remaining;
}

/** Restore only this task so a failed save cannot undo another card's move. */
export function restoreTask(tasks: Task[], task: Task, previous: Task[]): Task[] {
  const next = previous
    .slice(previous.findIndex((item) => item.id === task.id) + 1)
    .find(
      (item) =>
        item.status === task.status &&
        tasks.some((current) => current.id === item.id && current.status === task.status),
    );
  return placeTask(tasks, task, task.status, next?.id);
}
