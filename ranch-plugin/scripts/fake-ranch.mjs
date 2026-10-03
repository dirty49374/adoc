#!/usr/bin/env node
// A stand-in for the Ranch Api (herdr-ranch docs/PLUGINS.md §4) on this machine, for running the
// adoc-hub server and clients without a ranch network: one machine, the sessions named on the
// command line, event streams, datagrams by address or prefix, the Directory with peer_joined /
// peer_left / directory_change, subscribe, forward and set_status_icon.
//
// Usage: node scripts/fake-ranch.mjs <port> <runtime dir> <session>[:<pane>=<agent name>]…
//   The plugin server runs with RANCH_URL=http://127.0.0.1:<port>; each client with
//   RANCH_RUNTIME_DIR=<runtime dir> and HERDR_SESSION=<session> (this script writes <session>.json).
//   An agent given as ahq-dev:w2B:p1=adoc-dev appears in that session's Directory entry, working.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const [port, runtime, ...specs] = process.argv.slice(2);
const MACHINE = 'mldev';
const PLUGIN = 'adoc-hub';
const SERVER = `ranch://central/plugin/${PLUGIN}`;
const sessions = new Map();
for (const spec of specs) {
  const [session, agent] = spec.split(/:(.*)/s);
  const entry = sessions.get(session) ?? { address: `ranch://${MACHINE}/${session}`, machine: MACHINE, session, clients: [], agents: [] };
  if (agent) {
    const [pane, name] = agent.split('=');
    entry.agents.push({ address: `${entry.address}/agent/${encodeURIComponent(pane)}`, name, default_name: name, kind: 'claude', status: 'working', pane });
  }
  sessions.set(session, entry);
}
mkdirSync(runtime, { recursive: true });
for (const session of sessions.keys()) writeFileSync(join(runtime, `${session}.json`), JSON.stringify({ url: `http://127.0.0.1:${port}/s/${session}` }));

/** address → SSE response */
const streams = new Map();
const subscribers = new Set();
let forwarded = {};

function event(address, name, data) {
  streams.get(address)?.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}
function directoryChange(entry) {
  for (const s of subscribers) event(s, 'notification', { op: 'directory_change', data: { sessions: [entry], plugin_servers: [], removed: [] } });
}
/** The address of a request's endpoint: /plugin/adoc-hub for the server, /s/<session>/plugin/adoc-hub/<n> for a client. */
function endpointOf(path) {
  if (path.startsWith(`/plugin/${PLUGIN}`)) return { address: SERVER, rest: path.slice(`/plugin/${PLUGIN}`.length) };
  const m = path.match(new RegExp(`^/s/([^/]+)/plugin/${PLUGIN}/(\\d+)(.*)$`));
  if (!m || !sessions.has(m[1])) return null;
  return { address: `ranch://${MACHINE}/${m[1]}/plugin/${PLUGIN}/${m[2]}`, session: m[1], instance: m[2], rest: m[3] };
}
const body = (req) => new Promise((resolve) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });
const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ep = endpointOf(url.pathname);
  if (!ep) return json(res, 404, { reason: 'no such endpoint' });
  if (ep.rest === '/recv') {
    if (streams.has(ep.address)) return json(res, 409, { reason: 'address in use' });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    streams.set(ep.address, res);
    event(ep.address, 'welcome', { address: ep.address, protocol: 1, server_version: 'fake', server_source: 'fake-ranch' });
    const entry = sessions.get(ep.session);
    if (entry && ep.instance === '0') {
      entry.clients = [ep.address];
      event(SERVER, 'notification', { op: 'peer_joined', data: { address: ep.address } });
      directoryChange(entry);
    }
    if (ep.address === SERVER) for (const a of streams.keys()) if (a.endsWith('/0')) event(a, 'notification', { op: 'peer_joined', data: { address: SERVER } });
    req.on('close', () => {
      streams.delete(ep.address);
      subscribers.delete(ep.address);
      if (entry && ep.instance === '0') {
        entry.clients = [];
        event(SERVER, 'notification', { op: 'peer_left', data: { address: ep.address } });
        directoryChange(entry);
      }
    });
    return;
  }
  if (ep.rest === '/send' && req.method === 'POST') {
    const to = url.searchParams.get('to') ?? '';
    const bytes = await body(req);
    const data = { from: ep.address, base64: bytes.toString('base64'), text: bytes.toString('utf8') };
    const targets = [...streams.keys()].filter((a) => a !== ep.address && (a === to || (to.endsWith('/') && a.startsWith(to))));
    if (!to.endsWith('/') && targets.length === 0) event(ep.address, 'notification', { op: 'undeliverable', data: { destination: to, reason: 'not connected' } });
    for (const a of targets) event(a, 'datagram', data);
    res.writeHead(204);
    return res.end();
  }
  if (ep.rest.startsWith('/request/') && req.method === 'POST') {
    const op = ep.rest.slice('/request/'.length);
    const args = JSON.parse((await body(req)).toString() || '{}');
    if (op === 'subscribe') {
      subscribers.add(ep.address);
      return json(res, 200, { ok: true, result: { sessions: [...sessions.values()], plugin_servers: [], removed: [] } });
    }
    if (op === 'forward') {
      forwarded = { ...forwarded, ...Object.fromEntries(Object.entries(args.ports).map(([n, p]) => [n, `127.0.0.1:${p}`])) };
      return json(res, 200, { ok: true, result: {} });
    }
    if (op === 'set_status_icon') {
      console.log(`status icon of ${ep.address}: ${JSON.stringify(args.icon)}`);
      return json(res, 200, { ok: true, result: {} });
    }
    return json(res, 400, { reason: `unknown op ${op}` });
  }
  if (ep.rest === '/forward' && req.method === 'GET') return json(res, 200, forwarded);
  json(res, 404, { reason: 'unknown' });
}).listen(Number(port), '127.0.0.1', () => console.log(`fake ranch on ${port}: sessions ${[...sessions.keys()].join(', ')}`));
