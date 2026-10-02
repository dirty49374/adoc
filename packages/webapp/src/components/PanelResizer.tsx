import { ArrowLeftRight } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * _Panel_Resizer_: the draggable border that sets the width of the _Message_Dock_, with a button in its middle that
 * swaps the sides of the main area and the dock. `dockLeft` says on which side the dock is now.
 */
export function PanelResizer({ width, onWidth, dockLeft, onSwap }: { width: number; onWidth: (width: number) => void; dockLeft: boolean; onSwap: () => void }) {
  const start = useRef<{ x: number; width: number } | undefined>(undefined);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!start.current) return;
      const moved = e.clientX - start.current.x;
      const next = start.current.width + (dockLeft ? moved : -moved);
      onWidth(Math.max(280, Math.min(window.innerWidth - 400, next)));
    };
    const up = () => {
      // Resizing the panel is an interaction with the terminal: this tab takes control so that its size reaches the pane.
      if (start.current) window.dispatchEvent(new CustomEvent('adoc:panel-resized'));
      start.current = undefined;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [onWidth, dockLeft]);
  return (
    <div
      className="panel-resizer"
      data-testid="panel-resizer"
      title="Drag to resize"
      onPointerDown={(e) => {
        start.current = { x: e.clientX, width };
        document.body.classList.add('resizing');
      }}
    >
      <button
        className="panel-swap"
        title={dockLeft ? 'Put the main area on the left' : 'Put the agent panel on the left'}
        data-testid="panel-swap"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onSwap}
      >
        <ArrowLeftRight />
      </button>
    </div>
  );
}
