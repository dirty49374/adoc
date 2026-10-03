import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CURRENT_HOST, hostPath, usePresence, useHubHosts, type HubHost } from '../hub.js';

const labelOf = (host: HubHost) => host.name ?? host.title ?? host.address;

function dotClass(host: HubHost): string {
  if (host.status !== 'online') return 'host-dot offline';
  if (!host.agent) return 'host-dot no-agent';
  return `host-dot ${host.agent.status === 'working' ? 'working' : 'idle'}`;
}

/**
 * _Host_Switcher_: under a hub, the menu in place of the workspace name that lists every adoc host with its state and
 * moves the browser to another one; it also keeps the presence connections to the other hosts.
 */
export function HostSwitcher() {
  const hosts = useHubHosts();
  usePresence(hosts);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = hosts.find((h) => h.address === CURRENT_HOST);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="host-switcher" ref={box} data-testid="host-switcher">
      <button className="workspace-name" onClick={() => setOpen(!open)} title="Switch to another adoc host">
        <span className="product">adoc</span>
        {current && <span className={dotClass(current)} />}
        {current ? labelOf(current) : CURRENT_HOST}
        <ChevronDown size={14} />
      </button>
      {open && (
        <ul className="host-menu floating" role="menu">
          {hosts.map((host) => (
            <li key={host.address}>
              <button
                className={host.address === CURRENT_HOST ? 'current' : ''}
                disabled={host.status !== 'online'}
                onClick={() => location.assign(hostPath(host))}
                title={host.workspace}
              >
                <span className={dotClass(host)} />
                <span className="host-label">{labelOf(host)}</span>
                <span className="adoc-muted">
                  {host.machine} · {host.address}
                  {host.status !== 'online' ? ' · offline' : host.agent ? ` · ${host.agent.name} ${host.agent.status}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
