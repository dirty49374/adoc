import { useLive } from '../live.js';

/** _Connection_Status_Label_: whether the live event channel to the server is open. */
export function ConnectionStatusLabel() {
  const { status } = useLive();
  const text = status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting…' : 'disconnected: server unreachable';
  return (
    <span className={`connection-status ${status}`} data-testid="connection-status">
      <span className="dot" />
      {text}
    </span>
  );
}
