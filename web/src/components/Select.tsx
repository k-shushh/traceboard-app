import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string; color?: string };

/** A themed single-select. Focus stays on the trigger; arrows navigate the list. */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  selectedValues,
  onToggle,
  placeholder = 'Choose…',
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  selectedValues?: string[];
  onToggle?: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({});
  const selected = options.find((option) => option.value === value);
  const display = selectedValues
    ? options
        .filter((o) => selectedValues.includes(o.value))
        .map((o) => o.label)
        .join(', ')
    : selected?.label;
  function show() {
    const rect = trigger.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < 190 && above > below;
    const width = 'max-content';
    setPosition({
      position: 'fixed',
      width,
      maxWidth: Math.min(320, window.innerWidth - 24),
      left: rect.left,
      top: upwards ? undefined : rect.bottom + 6,
      bottom: upwards ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: Math.min(260, upwards ? above : below),
    });
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  }
  useLayoutEffect(() => {
    if (!open || !popup.current || !trigger.current) return;
    const menu = popup.current.getBoundingClientRect();
    const rect = trigger.current.getBoundingClientRect();
    setPosition((old) => ({
      ...old,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - menu.width - 12)),
    }));
  }, [open, display]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const dismiss = () => setOpen(false);
    const scroll = (event: Event) => {
      if (!popup.current?.contains(event.target as Node)) dismiss();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) popup.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  function choose(index: number) {
    if (options[index]) {
      if (onToggle) onToggle(options[index].value);
      else onChange(options[index].value);
    }
    if (!onToggle) setOpen(false);
    trigger.current?.focus();
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        choose(active);
        return;
      }
      setActive((index) =>
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
      );
    } else if (open && event.key.length === 1) {
      const index = options.findIndex((option) =>
        option.label.toLowerCase().startsWith(event.key.toLowerCase()),
      );
      if (index >= 0) setActive(index);
    }
  }
  return (
    <div className="select-control">
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={label}
        title={display || placeholder}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onBlur={() => setOpen(false)}
        onKeyDown={keyboard}
        onClick={() => (open ? setOpen(false) : show())}
      >
        {selected?.color && <i className={`select-dot priority-${selected.color}`} />}
        <span>{display || placeholder}</span>
        <ChevronDown size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            id={id}
            role="listbox"
            aria-multiselectable={selectedValues ? true : undefined}
            aria-label={label}
            className="select-popup"
            style={position}
          >
            {options.map((option, index) => (
              <div
                id={`${id}-${index}`}
                role="option"
                aria-selected={
                  selectedValues ? selectedValues.includes(option.value) : option.value === value
                }
                key={option.value}
                className={`select-option ${index === active ? 'highlighted' : ''}`}
                onPointerDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(index)}
              >
                {selectedValues && (
                  <span
                    className={`select-checkbox ${selectedValues.includes(option.value) ? 'checked' : ''}`}
                  >
                    {selectedValues.includes(option.value) && <Check size={11} />}
                  </span>
                )}
                {option.color && <i className={`select-dot priority-${option.color}`} />}
                <span>{option.label}</span>
                {!selectedValues && (
                  <span className="select-check">
                    {option.value === value && <Check size={14} />}
                  </span>
                )}
              </div>
            ))}
          </div>,
          trigger.current?.closest('dialog') || document.body,
        )}
    </div>
  );
}
