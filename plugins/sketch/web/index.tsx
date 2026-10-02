import { Excalidraw, exportToBlob, hashElementsVersion, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './board.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Excalidraw loads its fonts from here: the build copies them next to this module (client/fonts/).
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL('./', import.meta.url).pathname;

type Outcome = { status: string; reason?: string; error?: string };

const SAVE_DELAY_MS = 1200;

function dark(): boolean {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}

async function readScene(key: string): Promise<{ text: string; data: Record<string, unknown> }> {
  const response = await fetch(`/api/documents/${encodeURIComponent(key)}/file`);
  if (!response.ok) throw new Error(`cannot read ${key}`);
  const { text } = (await response.json()) as { text: string };
  return { text, data: text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

function base64(blob: Blob): Promise<string> {
  return new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The board of one SKETCH document. Every change is saved through the `save` action (the Excalidraw JSON and a PNG
 * export) and then announced with one draft per document; changes by the agent come in through
 * `adoc-documents-changed`.
 */
function Board({ host, docKey, file }: { host: HTMLElement; docKey: string; file: string }) {
  const [initial, setInitial] = useState<Record<string, unknown>>();
  const [failure, setFailure] = useState<string>();
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const saved = useRef<{ text: string; hash: number }>({ text: '', hash: 0 });
  const timer = useRef<number | undefined>(undefined);
  const saving = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    readScene(docKey).then(({ text, data }) => {
      saved.current = { text, hash: hashElementsVersion((data.elements as never) ?? []) };
      setInitial({ elements: data.elements ?? [], appState: { ...(data.appState as object), theme: dark() ? 'dark' : 'light' }, files: data.files ?? {}, scrollToContent: true });
    }, (error: Error) => setFailure(error.message));
    const changed = (e: Event) => {
      if (!(e as CustomEvent<{ keys: string[] }>).detail.keys.includes(docKey)) return;
      void readScene(docKey).then(({ text, data }) => {
        if (text === saved.current.text || !api.current) return;
        // Someone else (the agent) changed the file: show it.
        saved.current = { text, hash: hashElementsVersion((data.elements as never) ?? []) };
        api.current.updateScene({ elements: (data.elements as never) ?? [] });
      });
    };
    window.addEventListener('adoc-documents-changed', changed);
    return () => window.removeEventListener('adoc-documents-changed', changed);
  }, [docKey]);

  const action = (value: string) =>
    new Promise<Outcome>((reply) => host.dispatchEvent(new CustomEvent('adoc-action', { bubbles: true, detail: { name: 'save', value, reply } })));

  const save = async () => {
    const board = api.current;
    if (!board) return;
    if (saving.current) {
      pending.current = true;
      return;
    }
    const elements = board.getSceneElements();
    const hash = hashElementsVersion(elements);
    if (hash === saved.current.hash) return;
    saving.current = true;
    try {
      const appState = board.getAppState();
      const files = board.getFiles();
      const scene = serializeAsJSON(elements, appState, files, 'local');
      const png = await exportToBlob({ elements, appState: { ...appState, exportBackground: true }, files, mimeType: 'image/png' });
      const outcome = await action(JSON.stringify({ scene, png: await base64(png) }));
      if (outcome.status === 'applied') {
        saved.current = { text: scene, hash };
        const image = file.replace(/\.excalidraw$/, '.png');
        host.dispatchEvent(new CustomEvent('adoc-draft', { bubbles: true, detail: { text: `The sketch ${docKey} changed: ${image} (image) and ${file} (Excalidraw JSON).` } }));
      } else {
        // busy, or refused because the document moved on: try again shortly with the version the page has then.
        pending.current = true;
      }
    } finally {
      saving.current = false;
      if (pending.current) {
        pending.current = false;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
      }
    }
  };

  if (failure) return <p className="adoc-muted">{failure}</p>;
  if (!initial) return <p className="adoc-muted">Loading the sketch…</p>;
  return (
    <Excalidraw
      excalidrawAPI={(board) => (api.current = board)}
      initialData={initial as never}
      theme={dark() ? 'dark' : 'light'}
      onChange={(elements) => {
        if (hashElementsVersion(elements) === saved.current.hash) return;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
      }}
    />
  );
}

/** `<adoc-sketch data-adoc-document="SKETCH-x" data-adoc-file="docs/SKETCH-x.excalidraw">`: the board of one document. */
class AdocSketch extends HTMLElement {
  private root?: Root;

  connectedCallback(): void {
    this.root = createRoot(this);
    this.root.render(<Board host={this} docKey={this.dataset.adocDocument ?? ''} file={this.dataset.adocFile ?? ''} />);
  }

  disconnectedCallback(): void {
    this.root?.unmount();
  }
}

if (!customElements.get('adoc-sketch')) customElements.define('adoc-sketch', AdocSketch);
