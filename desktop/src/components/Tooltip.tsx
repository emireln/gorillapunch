import { cloneElement, isValidElement, useCallback, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type FocusEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 1700;
const EDGE_GAP = 8;

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  const id = useId().replace(/:/g, '');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const tooltip = useRef<HTMLSpanElement | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const schedule = useCallback((target: HTMLElement) => {
    cancel();
    anchor.current = target;
    setVisible(false);
    timer.current = setTimeout(() => {
      timer.current = null;
      setVisible(true);
    }, SHOW_DELAY_MS);
  }, [cancel]);
  const hide = useCallback(() => {
    cancel();
    anchor.current = null;
    setVisible(false);
  }, [cancel]);

  useLayoutEffect(() => {
    if (!visible || !anchor.current || !tooltip.current) return;
    const place = () => {
      const trigger = anchor.current;
      const bubble = tooltip.current;
      if (!trigger || !bubble) return;
      const rect = trigger.getBoundingClientRect();
      const bounds = bubble.getBoundingClientRect();
      const width = bounds.width;
      const height = bounds.height;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const centeredLeft = rect.left + (rect.width - width) / 2;
      const leftAt = (left: number) => Math.max(EDGE_GAP, Math.min(left, viewportWidth - width - EDGE_GAP));
      const topAt = (top: number) => Math.max(EDGE_GAP, Math.min(top, viewportHeight - height - EDGE_GAP));
      const top = rect.top - height - EDGE_GAP;
      const bottom = rect.bottom + EDGE_GAP;
      const right = rect.right + EDGE_GAP;
      const left = rect.left - width - EDGE_GAP;

      let next: { left: number; top: number };
      if (top >= EDGE_GAP && top + height <= viewportHeight - EDGE_GAP) next = { left: leftAt(centeredLeft), top };
      else if (bottom >= EDGE_GAP && bottom + height <= viewportHeight - EDGE_GAP) next = { left: leftAt(centeredLeft), top: bottom };
      else if (right + width <= viewportWidth - EDGE_GAP) next = { left: leftAt(right), top: topAt(rect.top + (rect.height - height) / 2) };
      else if (left >= EDGE_GAP) next = { left: leftAt(left), top: topAt(rect.top + (rect.height - height) / 2) };
      else {
        const useTop = rect.top > viewportHeight - rect.bottom;
        next = { left: leftAt(centeredLeft), top: topAt(useTop ? top : bottom) };
      }
      bubble.style.left = `${next.left}px`;
      bubble.style.top = `${next.top}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible, content]);

  useLayoutEffect(() => () => cancel(), [cancel]);
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<{ 'aria-describedby'?: string; onPointerEnter?: (event: PointerEvent<HTMLElement>) => void; onPointerLeave?: (event: PointerEvent<HTMLElement>) => void; onFocus?: (event: FocusEvent<HTMLElement>) => void; onBlur?: (event: FocusEvent<HTMLElement>) => void }>;
  const describedBy = [child.props['aria-describedby'], id].filter(Boolean).join(' ');
  // cloneElement preserves the child's ref and only composes tooltip event handlers here.
  // eslint-disable-next-line react-hooks/refs
  const trigger = cloneElement(child, {
    'aria-describedby': describedBy,
    onPointerEnter: event => { child.props.onPointerEnter?.(event); schedule(event.currentTarget); },
    onPointerLeave: event => { child.props.onPointerLeave?.(event); hide(); },
    onFocus: event => { child.props.onFocus?.(event); schedule(event.currentTarget); },
    onBlur: event => { child.props.onBlur?.(event); hide(); },
  });
  return <>{trigger}{visible && createPortal(<span ref={tooltip} id={id} className="gp-tooltip" role="tooltip" style={{ left: 0, top: 0 }}>{content}</span>, document.body)}</>;
}
