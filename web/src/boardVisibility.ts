import type { Task } from './types';

export type BoardPreferences = { hideDone: boolean; hidden: Record<string, number> };
export const emptyBoardPreferences = (): BoardPreferences => ({ hideDone: false, hidden: {} });

export function readBoardPreferences(raw: string | null): BoardPreferences {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || typeof value !== 'object') return emptyBoardPreferences();
    const hidden = Object.fromEntries(
      Object.entries(value.hidden || {}).filter(
        ([id, version]) => id.length <= 100 && Number.isInteger(version) && Number(version) > 0,
      ),
    ) as Record<string, number>;
    return { hideDone: value.hideDone === true, hidden };
  } catch {
    return emptyBoardPreferences();
  }
}

export function isTaskHidden(task: Task, preferences: BoardPreferences): boolean {
  // A reopened or edited task becomes visible again; only this completed revision is hidden.
  return task.status === 'done' && preferences.hidden[task.id] === task.version;
}

export function visibleBoardTasks(
  tasks: Task[],
  preferences: BoardPreferences,
  showHidden: boolean,
): Task[] {
  return tasks.filter(
    (task) =>
      task.status !== 'done' ||
      (!preferences.hideDone && (showHidden || !isTaskHidden(task, preferences))),
  );
}
