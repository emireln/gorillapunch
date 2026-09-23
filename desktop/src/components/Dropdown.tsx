import { CaretDown, Check } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

export type DropdownOption<T extends string | number> = { value: T; label: string };

export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  disabled = false,
}: {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange(value: T): void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === value));
  const selected = options[selectedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [menuPosition, setMenuPosition] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeahead = useRef('');
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 144), window.innerWidth - 16);
      const preferredHeight = Math.min(options.length * 38 + 10, 280);
      const below = window.innerHeight - rect.bottom - 10;
      const above = rect.top - 10;
      const placeAbove = below < Math.min(preferredHeight, 180) && above > below;
      const available = Math.max(96, placeAbove ? above : below);
      const maxHeight = Math.min(preferredHeight, available);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const top = placeAbove ? Math.max(8, rect.top - maxHeight - 6) : Math.min(rect.bottom + 6, window.innerHeight - maxHeight - 8);
      setMenuPosition({ left, top, width, maxHeight });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open, options.length]);

  const openAt = (index: number) => {
    const next = Math.max(0, Math.min(index, options.length - 1));
    setActiveIndex(next);
    setOpen(true);
    requestAnimationFrame(() => optionRefs.current[next]?.focus());
  };

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    setMenuPosition(null);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setActiveIndex(index);
    close(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!options.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAt(open ? (activeIndex + 1) % options.length : selectedIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(open ? (activeIndex - 1 + options.length) % options.length : selectedIndex);
    } else if (event.key === 'Home') {
      event.preventDefault();
      openAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      openAt(options.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && !open) {
      event.preventDefault();
      openAt(selectedIndex);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab' && open) {
      close(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      typeahead.current += event.key.toLocaleLowerCase();
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = setTimeout(() => { typeahead.current = ''; }, 650);
      const start = open ? (activeIndex + 1) % options.length : 0;
      const ordered = [...options.slice(start), ...options.slice(0, start)];
      const match = ordered.find(option => option.label.toLocaleLowerCase().startsWith(typeahead.current));
      if (match) {
        const index = options.indexOf(match);
        if (open) openAt(index);
        else { setActiveIndex(index); onChange(match.value); }
      }
    }
  };

  useEffect(() => () => { if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current); }, []);

  return <div className={`gp-dropdown ${className}`}>
    <button
      ref={triggerRef}
      type="button"
      className="gp-dropdown-trigger"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? `${id}-listbox` : undefined}
      disabled={disabled || options.length === 0}
      onClick={() => open ? close(true) : openAt(selectedIndex)}
      onKeyDown={handleKeyDown}
    >
      <span className="gp-dropdown-value">{selected?.label ?? ''}</span>
      <CaretDown className="gp-dropdown-chevron" size={15} weight="bold" aria-hidden="true"/>
    </button>
    {open && menuPosition && createPortal(
      <div ref={menuRef} id={`${id}-listbox`} role="listbox" aria-label={ariaLabel} className="gp-dropdown-menu" style={menuPosition}>
        {options.map((option, index) => <button
          key={String(option.value)}
          ref={element => { optionRefs.current[index] = element; }}
          type="button"
          role="option"
          aria-selected={option.value === value}
          tabIndex={activeIndex === index ? 0 : -1}
          className="gp-dropdown-option"
          onClick={() => choose(index)}
          onMouseMove={() => setActiveIndex(index)}
          onKeyDown={handleKeyDown}
        >
          <span>{option.label}</span>
          {option.value === value && <Check size={15} weight="bold" aria-hidden="true"/>}
        </button>)}
      </div>,
      document.body,
    )}
  </div>;
}
