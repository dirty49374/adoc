#!/usr/bin/env node
// A stand-in for the adoc hub on this machine, for developing and testing the web UI under a hub without the ranch
// plugin: `/adoc-discovery` (JSON, and `/adoc-discovery/events` as server-sent events) from `adoc server list`, and
// `/<machine>_<port>/…` forwarded to that server with X-Forwarded-Prefix and X-Adoc-Hub, WebSockets included.
// Usage: node tooling/dev-hub.mjs [port]   (default 7790; no authentication, loopback only)
import { execFile } from 'node:child_process';
import { request as httpRequest, createServer } from 'node:http';
import { connect } from 'node:net';
import { hostname } from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PORT = Number(process.argv[2] ?? 7790);
const MACHINE = hostname().split('.')[0];
const ADOC = new URL('../packages/cli/dist/entry.js', import.meta.url).pathname;

/** The hosts of this machine, in the shape of the hub's discovery list. */
async function discover() {
  const { stdout } = await run(process.execPath, [ADOC, 'server', 'list', '--output', 'json']);
  const servers = JSON.parse(stdout);
  return Promise.all(
    servers.map(async (server) => {
      const port = new URL(server.url).port;
      const host = { address: `${MACHINE}_${port}`, name: null, machine: MACHINE, workspace: server.workspace, url: server.url, status: server.status, version: null, agent: null };
      if (server.status !== 'online') return host;
      try {
        const info = await (await fetch(`${server.url}/api/workspace`)).json();
        const claim = info.agent?.claim;
        return { ...host, name: null, title: info.name, version: info.version ?? null, agent: claim ? { name: info.agent.name, status: claim.gone ? 'gone' : claim.status ?? 'unknown' } : null };
      } catch {
        return host;
      }
    }),
  );
}

let hosts = await discover();
const listeners = new Set();
setInterval(async () => {
  const next = await discover().catch(() => hosts);
  if (JSON.stringify(next) === JSON.stringify(hosts)) return;
  hosts = next;
  for (const send of listeners) send();
}, 2000);

function target(path) {
  const match = /^\/([A-Za-z0-9-]+_\d+)(\/.*)?$/.exec(path);
  const host = match && hosts.find((h) => h.address === match[1]);
  return host ? { host, rest: match[2] ?? '/' } : undefined;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://hub');
  if (url.pathname === '/adoc-discovery') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ hosts }));
  }
  if (url.pathname === '/adoc-discovery/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const send = () => res.write(`data: ${JSON.stringify({ hosts })}\n\n`);
    send();
    listeners.add(send);
    return req.on('close', () => listeners.delete(send));
  }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<!doctype html><title>adoc hub (dev)</title><h1>adoc hub (dev)</h1><ul>${hosts.map((h) => `<li><a href="/${h.address}/">${h.address}</a> ${h.workspace} — ${h.status}</li>`).join('')}</ul>`);
  }
  const found = target(url.pathname);
  if (!found || found.host.status !== 'online') {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(`<p>No online adoc at ${url.pathname.split('/')[1]}. <a href="/">All hosts</a></p>`);
  }
  const upstream = new URL(found.host.url);
  const proxied = httpRequest(
    { host: upstream.hostname, port: upstream.port, method: req.method, path: found.rest + url.search, headers: { ...req.headers, host: upstream.host, 'x-forwarded-prefix': `/${found.host.address}`, 'x-adoc-hub': '/adoc-discovery' } },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  proxied.on('error', () => res.writeHead(502).end());
  req.pipe(proxied);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://hub');
  const found = target(url.pathname);
  if (!found) return socket.destroy();
  const upstream = new URL(found.host.url);
  const conn = connect(Number(upstream.port), upstream.hostname, () => {
    const headers = { ...req.headers, host: upstream.host, 'x-forwarded-prefix': `/${found.host.address}`, 'x-adoc-hub': '/adoc-discovery' };
    conn.write(`${req.method} ${found.rest}${url.search} HTTP/1.1\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
    if (head.length) conn.write(head);
    conn.pipe(socket);
    socket.pipe(conn);
  });
  conn.on('error', () => socket.destroy());
  socket.on('error', () => conn.destroy());
});

server.listen(PORT, '127.0.0.1', () => console.log(`adoc dev hub at http://127.0.0.1:${PORT}/ (${hosts.length} hosts)`));
