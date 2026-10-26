import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateBoardTasks, dateLabel, localDateValue } from '../agenda';
import type { User } from '../types';
import { Board, type BoardProps } from './Board';

export function MyBoard({ user, ...props }: BoardProps & { user: User }) {
  const today = localDateValue();
  const [date, setDate] = useState(today);
  const [includeOverdue, setIncludeOverdue] = useState(false);
  const [includeUndated, setIncludeUndated] = useState(false);
  const tasks = dateBoardTasks(props.tasks, user.id, date, today, includeOverdue, includeUndated);
  function shift(days: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    const value = localDateValue(next);
    if (value >= '0001-01-01' && value <= '9999-12-31') setDate(value);
  }
  return (
    <section className="date-board">
      <div className="agenda-toolbar">
        <label>
          Due on
          <input
            type="date"
            value={date}
            min="0001-01-01"
            max="9999-12-31"
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value);
            }}
          />
        </label>
        <div className="row agenda-date-buttons">
          <button className="icon-button" aria-label="Previous day" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => setDate(today)}>Today</button>
          <button className="icon-button" aria-label="Next day" onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeOverdue}
            onChange={(e) => setIncludeOverdue(e.target.checked)}
          />
          Include overdue
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeUndated}
            onChange={(e) => setIncludeUndated(e.target.checked)}
          />
          Include no date
        </label>
      </div>
      <p className="date-board-summary">
        Due {dateLabel(date)} · {tasks.filter((task) => task.status !== 'done').length} pending
      </p>
      <Board {...props} tasks={tasks} showUndated />
    </section>
  );
}
