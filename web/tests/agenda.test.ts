import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateBoardTasks, localDateValue } from '../src/agenda.ts';
import { readBoardPreferences, isTaskHidden, visibleBoardTasks } from '../src/boardVisibility.ts';
import type { Task } from '../src/types';

const task = (id: string, date: string | null, status = 'todo', assignee = 'me') =>
  ({
    id,
    number: Number(id),
    title: id,
    deliverable_date: date,
    status,
    assignee_id: assignee,
    private: false,
    owner_id: 'me',
    version: 1,
  }) as Task;

test('date view selects the exact due date across all three statuses', () => {
  const tasks = [
    task('1', '2026-10-25'),
    task('2', '2026-10-26'),
    task('3', '2026-10-26', 'progress'),
    task('4', '2026-10-26', 'done'),
    task('5', null),
    task('6', '2026-10-27'),
  ];
  assert.deepEqual(
    dateBoardTasks(tasks, 'me', '2026-10-26', '2026-10-26', false, false).map((t) => t.id),
    ['2', '3', '4'],
  );
});
test('overdue adds only unfinished older work; undated is an explicit option', () => {
  const tasks = [
    task('1', '2026-10-25'),
    task('2', '2026-10-25', 'done'),
    task('3', null),
    task('4', null, 'done'),
    task('5', '2026-10-26'),
  ];
  assert.deepEqual(
    dateBoardTasks(tasks, 'me', '2026-10-26', '2026-10-26', true, false).map((t) => t.id),
    ['1', '5'],
  );
  assert.deepEqual(
    dateBoardTasks(tasks, 'me', '2026-10-26', '2026-10-26', false, true).map((t) => t.id),
    ['3', '4', '5'],
  );
});
test('future selections do not label future unfinished work overdue', () => {
  const tasks = [task('1', '2026-10-27'), task('2', '2026-10-28'), task('3', '2026-10-25')];
  assert.deepEqual(
    dateBoardTasks(tasks, 'me', '2026-10-28', '2026-10-26', true, false).map((t) => t.id),
    ['2', '3'],
  );
  assert.deepEqual(dateBoardTasks(tasks, 'me', '2026-10-24', '2026-10-26', true, false), []);
});
test('all, multiple and private assignments preserve personal scope', () => {
  const tasks = [
    { ...task('1', '2026-10-26', 'todo', ''), assign_all: true },
    { ...task('2', '2026-10-26', 'todo', ''), assignee_ids: ['me', 'sam'] },
    { ...task('3', '2026-10-26', 'todo', ''), private: true },
    task('4', '2026-10-26', 'todo', 'other'),
  ];
  assert.deepEqual(
    dateBoardTasks(tasks, 'me', '2026-10-26', '2026-10-26', false, false).map((t) => t.id),
    ['1', '2', '3'],
  );
  assert.deepEqual(
    dateBoardTasks(tasks, 'sam', '2026-10-26', '2026-10-26', false, false).map((t) => t.id),
    ['1', '2'],
  );
});
test('date values use calendar fields rather than UTC', () => {
  assert.equal(localDateValue(new Date(2026, 10, 11, 0, 15)), '2026-11-11');
});
test('hide completed and individual hide never remove pending tasks', () => {
  const tasks = [
    task('1', null),
    task('2', null, 'progress'),
    task('3', null, 'done'),
    task('4', null, 'done'),
  ];
  const prefs = { hideDone: false, hidden: { '3': 1, '1': 1 } };
  assert.deepEqual(
    visibleBoardTasks(tasks, prefs, false).map((t) => t.id),
    ['1', '2', '4'],
  );
  assert.equal(visibleBoardTasks(tasks, prefs, true).length, 4);
  assert.deepEqual(
    visibleBoardTasks(tasks, { ...prefs, hideDone: true }, true).map((t) => t.id),
    ['1', '2'],
  );
  assert.equal(isTaskHidden({ ...tasks[2], version: 2 }, prefs), false);
});
test('bad or stale browser storage is tolerated', () => {
  for (const raw of [null, 'bad json', 'null', '42'])
    assert.deepEqual(readBoardPreferences(raw), { hideDone: false, hidden: {} });
  assert.deepEqual(
    readBoardPreferences(
      JSON.stringify({ hideDone: true, hidden: { good: 2, bad: -1, wrong: '1' } }),
    ),
    { hideDone: true, hidden: { good: 2 } },
  );
});
