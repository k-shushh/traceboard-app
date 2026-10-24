import { Select } from './Select';
import type { Member } from '../types';

export function AssigneeSelect({
  label,
  members,
  ids,
  all,
  privateTask = false,
  onChange,
}: {
  label: string;
  members: Member[];
  ids: string[];
  all: boolean;
  privateTask?: boolean;
  onChange: (ids: string[], all: boolean) => void;
}) {
  return (
    <Select
      label={label}
      value=""
      placeholder="Choose assignees"
      disabled={privateTask}
      selectedValues={all ? ['all'] : ids}
      options={[
        ...(!privateTask ? [{ value: 'all', label: 'Assign all' }] : []),
        ...members.map((m) => ({ value: m.id, label: m.name })),
      ]}
      onChange={() => {}}
      onToggle={(id) => {
        if (id === 'all') onChange([], !all);
        else
          onChange(
            all ? [id] : ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
            false,
          );
      }}
    />
  );
}
