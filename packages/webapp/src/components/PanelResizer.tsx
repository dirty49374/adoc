import { useEffect, useRef } from 'react';

/** _Panel_Resizer_: the draggable border that sets the width of the right panel. */
export function PanelResizer({ width, onWidth }: { width: number; onWidth: (width: number) => void }) {
  const start = useRef<{ x: number; width: number } | undefined>(undefined);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!start.current) return;
      const next = start.current.width + (start.current.x - e.clientX);
      onWidth(Math.max(280, Math.min(window.innerWidth - 700, next)));
    };
    const up = () => {
      start.current = undefined;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [onWidth]);
  return (
    <div
      className="panel-resizer"
      data-testid="panel-resizer"
      title="Drag to resize"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, width };
        document.body.classList.add('resizing');
      }}
    />
  );
}
