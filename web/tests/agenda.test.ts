import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgenda, localDateValue } from '../src/agenda.ts';
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
  }) as Task;

test('November 9 unfinished work is included when selecting November 11', () => {
  const result = buildAgenda(
    [
      task('1', '2026-11-09'),
      task('2', '2026-11-11'),
      task('3', '2026-11-09', 'done'),
      task('4', '2026-11-12'),
      task('5', null),
      task('6', '2026-11-09', 'todo', 'other'),
    ],
    'me',
    '2026-11-11',
    '2026-11-08',
    true,
  );
  assert.equal(result.pending, 2);
  assert.equal(result.overdue.length, 0);
  assert.deepEqual(
    result.scheduled.map((group) => group.date),
    ['2026-11-09', '2026-11-11'],
  );
  assert.equal(result.unscheduled.length, 1);
  assert.equal(result.later, 1);
});

test('overdue is relative to today, without double counting or hiding completed history', () => {
  const result = buildAgenda(
    [task('1', '2026-11-09'), task('2', '2026-11-11'), task('3', '2026-11-09', 'done')],
    'me',
    '2026-11-11',
    '2026-11-10',
    true,
  );
  assert.equal(result.pending, 2);
  assert.deepEqual(
    result.overdue[0].tasks.map((task) => task.id),
    ['1'],
  );
  assert.deepEqual(
    result.scheduled.flatMap((group) => group.tasks.map((task) => task.id)),
    ['3', '2'],
  );
});

test('completed toggle does not change pending total; cutoff excludes later tasks', () => {
  const tasks = [task('1', '2026-11-09'), task('2', '2026-11-11'), task('3', '2026-11-09', 'done')];
  const result = buildAgenda(tasks, 'me', '2026-11-09', '2026-11-10', false);
  assert.equal(result.pending, 1);
  assert.equal(result.scheduled.length, 0);
  assert.equal(result.later, 1);
});

test('date values use calendar fields rather than UTC', () => {
  assert.equal(localDateValue(new Date(2026, 10, 11, 0, 15)), '2026-11-11');
});

test('shared team assignments appear once for every teammate', () => {
  const shared = { ...task('1', '2026-11-09', 'todo', ''), assign_all: true };
  for (const person of ['me', 'teammate']) {
    const result = buildAgenda([shared], person, '2026-11-11', '2026-11-10', true);
    assert.equal(result.pending, 1);
    assert.equal(result.overdue[0].tasks.length, 1);
  }
});

test('explicit multiple assignees include only the selected teammates', () => {
  const shared = { ...task('1', '2026-11-09', 'todo', ''), assignee_ids: ['me', 'teammate'] };
  for (const person of ['me', 'teammate', 'other']) {
    assert.equal(
      buildAgenda([shared], person, '2026-11-11', '2026-11-10', true).pending,
      person === 'other' ? 0 : 1,
    );
  }
});
