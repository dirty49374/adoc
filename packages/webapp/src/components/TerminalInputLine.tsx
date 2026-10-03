import { useRef, useState, type KeyboardEvent, type Ref } from 'react';

/** Whether this device takes touch: there, xterm.js breaks input-method compositions such as Korean apart. */
export const TOUCH = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

/** Keys that reach the pane as they are while the field is empty. */
const PASS_THROUGH: Record<string, string> = {
  Backspace: '\x7f',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Escape: '\x1b',
  Tab: '\t',
};

/**
 * _Terminal_Input_Line_: on a touch device, the field below the _Terminal_Panel_ where the device's input method composes
 * the text; Enter sends it with Enter, Shift+Enter with a new line (ESC CR). With the field empty, Backspace, the arrows,
 * Escape, Tab and Ctrl+C go to the pane as keys.
 */
export function TerminalInputLine({ send, ref }: { send: (data: string) => void; ref?: Ref<HTMLInputElement> }) {
  const [text, setText] = useState('');
  const composing = useRef(false);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // an Enter that ends a composition only ends it
    if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      send(text + (e.shiftKey ? '\x1b\r' : '\r'));
      setText('');
      return;
    }
    if (text !== '') return;
    const key = e.ctrlKey && e.key.toLowerCase() === 'c' ? '\x03' : PASS_THROUGH[e.key];
    if (key && !e.altKey && !e.metaKey) {
      e.preventDefault();
      send(key);
    }
  };

  return (
    <input
      ref={ref}
      className="terminal-input-line"
      data-testid="terminal-input-line"
      value={text}
      placeholder="Type for the agent · Enter sends"
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="send"
      onChange={(e) => setText(e.target.value)}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => (composing.current = false)}
      onKeyDown={onKeyDown}
    />
  );
}
