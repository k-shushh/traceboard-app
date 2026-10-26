import { useEffect, useState } from 'react';
import type { Task } from './types';
import {
  emptyBoardPreferences,
  readBoardPreferences,
  type BoardPreferences,
} from './boardVisibility';

export function useBoardPreferences(account: string) {
  const key = `traceboard-board-view:${account}`;
  const [stored, setStored] = useState<{ key: string; value: BoardPreferences }>({
    key: '',
    value: emptyBoardPreferences(),
  });
  const [hiddenView, setHiddenView] = useState('');
  const value = stored.key === key ? stored.value : emptyBoardPreferences();
  const showHidden = hiddenView === key;
  useEffect(() => {
    let next = emptyBoardPreferences();
    try {
      next = readBoardPreferences(localStorage.getItem(key));
    } catch {
      /* Storage may be disabled. */
    }
    setStored({ key, value: next });
    setHiddenView('');
  }, [key]);
  function update(next: BoardPreferences) {
    setStored({ key, value: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Keep the current session usable. */
    }
  }
  return {
    value,
    showHidden,
    setHideDone: (hideDone: boolean) => update({ ...value, hideDone }),
    setShowHidden: (show: boolean) => {
      setHiddenView(show ? key : '');
      if (show) update({ ...value, hideDone: false });
    },
    toggleTask: (task: Task) => {
      if (task.status !== 'done') return;
      const hidden = { ...value.hidden };
      if (hidden[task.id] === task.version) delete hidden[task.id];
      else hidden[task.id] = task.version;
      update({ ...value, hidden });
    },
  };
}

export type BoardView = ReturnType<typeof useBoardPreferences>;
