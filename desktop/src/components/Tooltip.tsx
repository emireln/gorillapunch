import { cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode, type CSSProperties, type FocusEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const id = useId().replace(/:/g, '');
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [below, setBelow] = useState(false);
  const show = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const placeBelow = rect.top < 52;
    setBelow(placeBelow);
    setPosition({ left: Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8)), top: placeBelow ? rect.bottom + 8 : rect.top - 8 });
  };
  const hide = () => setPosition(null);
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<{ 'aria-describedby'?: string; onPointerEnter?: (event: PointerEvent<HTMLElement>) => void; onPointerLeave?: (event: PointerEvent<HTMLElement>) => void; onFocus?: (event: FocusEvent<HTMLElement>) => void; onBlur?: (event: FocusEvent<HTMLElement>) => void }>;
  const describedBy = [child.props['aria-describedby'], id].filter(Boolean).join(' ');
  const trigger = cloneElement(child, {
    'aria-describedby': describedBy,
    onPointerEnter: event => { child.props.onPointerEnter?.(event); show(event.currentTarget); },
    onPointerLeave: event => { child.props.onPointerLeave?.(event); hide(); },
    onFocus: event => { child.props.onFocus?.(event); show(event.currentTarget); },
    onBlur: event => { child.props.onBlur?.(event); hide(); },
  });
  return <>{trigger}{position && createPortal(<span id={id} className={`gp-tooltip ${below ? 'below' : ''}`} role="tooltip" style={position}>{content}</span>, document.body)}</>;
}
