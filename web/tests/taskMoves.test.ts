import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeTask, restoreTask } from '../src/taskMoves.ts';
import type { Task } from '../src/types';

const a = { id: 'a', status: 'todo', version: 1 } as Task;
const b = { id: 'b', status: 'todo', version: 1 } as Task;
const c = { id: 'c', status: 'progress', version: 1 } as Task;
const ids = (tasks: Task[], status: string) => tasks.filter(t => t.status === status).map(t => t.id);

test('reordering within a lane keeps the requested before position', () => {
  const tasks = placeTask([a, b, c], b, 'todo', 'a');
  assert.deepEqual(ids(tasks, 'todo'), ['b', 'a']);
  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].version, 1);
});

test('moving to an occupied or empty lane inserts exactly one task', () => {
  const tasks = placeTask([a, b, c], a, 'progress');
  assert.deepEqual(ids(tasks, 'progress'), ['c', 'a']);
  assert.deepEqual(ids(tasks, 'todo'), ['b']);
  assert.deepEqual(ids(placeTask(tasks, b, 'done'), 'done'), ['b']);
});

test('rollback restores only the failed task and preserves another successful move', () => {
  const original = [a, b, c];
  let current = placeTask(original, a, 'progress');
  current = placeTask(current, { ...c, version: 2 }, 'done');
  const restored = restoreTask(current, a, original);
  assert.deepEqual(ids(restored, 'todo'), ['a', 'b']);
  assert.deepEqual(ids(restored, 'done'), ['c']);
  assert.equal(restored.find(t => t.id === 'c')?.version, 2);
  assert.deepEqual(original, [a, b, c]);
});

test('rollback handles the original neighbor being moved away', () => {
  const original = [a, b, c];
  const current = placeTask(placeTask(original, a, 'progress'), b, 'done');
  const restored = restoreTask(current, a, original);
  assert.deepEqual(ids(restored, 'todo'), ['a']);
  assert.deepEqual(ids(restored, 'done'), ['b']);
});
