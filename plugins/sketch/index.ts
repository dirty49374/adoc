import { definePlugin, html } from '@adoc/plugin-kit';
import type { PluginDocument } from '@adoc/plugin-kit';

/** The parts of an Excalidraw file that the summary needs. */
interface Scene {
  type?: string;
  elements?: Array<{ type?: string; text?: string; isDeleted?: boolean; y?: number }>;
}

function parse(doc: PluginDocument): Scene {
  if (!doc.text.trim()) return { type: 'excalidraw', elements: [] };
  const scene = JSON.parse(doc.text) as Scene;
  if (scene.type !== 'excalidraw') throw new Error('not an Excalidraw file: "type" must be "excalidraw"');
  return scene;
}

function board(doc: PluginDocument) {
  return html`<adoc-sketch data-adoc-document="${doc.key}" data-adoc-file="${doc.file}"></adoc-sketch>`;
}

export default definePlugin({
  description: 'A drawing, such as a UI wireframe, that the person draws in Excalidraw; saved as Excalidraw JSON with a PNG beside it.',
  layout: { kind: 'file', extension: '.excalidraw', companions: ['.png'] },

  summarize(doc) {
    const shapes = (parse(doc).elements ?? []).filter((e) => !e.isDeleted);
    const texts = shapes.filter((e) => e.type === 'text' && e.text?.trim()).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    return { title: texts[0]?.text?.split('\n')[0]?.trim() || doc.localId, status: `${shapes.length} shapes`, fields: { texts: texts.length } };
  },

  // The board loads the file itself, so this output stays the same across versions and the page keeps the board.
  render(doc) {
    parse(doc);
    return board(doc);
  },

  // A line diff of the JSON says little; the change view shows the current drawing with a note.
  renderChanges(doc) {
    parse(doc);
    return html`<p class="adoc-muted">The drawing changed since you looked; the board shows the current one.</p>${board(doc)}`;
  },

  actions: {
    /** Sent by the board: the new Excalidraw JSON and the PNG export (base64). */
    save(_doc, event) {
      const { scene, png } = JSON.parse(event.value) as { scene?: unknown; png?: unknown };
      if (typeof scene !== 'string' || typeof png !== 'string') throw new Error('save needs { scene, png }');
      if ((JSON.parse(scene) as Scene).type !== 'excalidraw') throw new Error('save: the scene is not an Excalidraw file');
      return { text: scene, companions: { '.png': { base64: png } } };
    },
  },
});
