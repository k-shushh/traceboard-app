import { useEffect, useRef, useState } from 'react';
import { Users, Settings, UserRoundPen, LogOut } from 'lucide-react';
import { initials, type User } from '../types';

export function ProfileMenu({
  user,
  onSelect,
  onLogout,
}: {
  user: User;
  onSelect: (action: 'team' | 'profile' | 'settings') => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  function choose(action: 'team' | 'profile' | 'settings') {
    setOpen(false);
    trigger.current?.focus();
    onSelect(action);
  }
  return (
    <div className="profile-menu" ref={root}>
      <button
        ref={trigger}
        className="profile-trigger"
        aria-label={`Profile menu for ${user.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="profile-actions"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar small">{initials(user.name)}</span>
      </button>
      {open && (
        <div
          className="profile-popover"
          id="profile-actions"
          role="menu"
          aria-label="Profile options"
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
            );
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              items[
                (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
              ]?.focus();
            }
            if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
            }
            if (event.key === 'Tab') setOpen(false);
          }}
        >
          <div className="profile-summary" role="presentation">
            <strong>{user.name}</strong>
            <small>@{user.handle}</small>
          </div>
          <button role="menuitem" onClick={() => choose('team')}>
            <Users size={16} />
            View team
          </button>
          <button role="menuitem" onClick={() => choose('profile')}>
            <UserRoundPen size={16} />
            Edit profile
          </button>
          <button role="menuitem" onClick={() => choose('settings')}>
            <Settings size={16} />
            Settings
          </button>
          <button
            role="menuitem"
            className="profile-signout"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
