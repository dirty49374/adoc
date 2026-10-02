/** How the files of one document are laid out on disk. */
export type DocumentLayout =
  /** One file named `<KEY>-<id><extension>`, such as `TODO-gui.md`. */
  | { kind: 'file'; extension: string }
  /** One folder named `<KEY>-<id>/` whose main file is `entry`, such as `BUG-42/bug.yaml`. */
  | { kind: 'folder'; entry: string };

/** One document as adoc hands it to a plugin function. All paths are relative to the workspace root. */
export interface PluginDocument {
  /** The document key, such as `TODO-gui`. */
  readonly key: string;
  /** The plugin key, such as `TODO`. */
  readonly pluginKey: string;
  /** The part of the key after the first hyphen, such as `gui`. */
  readonly localId: string;
  /** The file or folder of the document. */
  readonly path: string;
  /** The main file: the file itself, or the entry file of a folder document. Use it for source positions. */
  readonly file: string;
  /** The text of the main file. Empty when the entry file of a folder document is missing. */
  readonly text: string;
  /** Every file of the document by path relative to the document: `{ 'TODO-gui.md': '…' }` or `{ 'bug.yaml': '…', 'notes.md': '…' }`. */
  readonly files: Readonly<Record<string, string>>;
}

/** What `summarize` returns. Shown in the document list and in reference tooltips. */
export interface DocumentSummary {
  title: string;
  /** Free text shown as is, such as `DONE` or `3/5 done`. */
  status: string;
  /** Extra rows for the tooltip table. */
  fields?: Record<string, string | number | boolean>;
}

/** A user operation on a control that `action()` marked. */
export interface ActionEvent {
  kind: 'click' | 'toggle' | 'drag';
  /** The action name given to `action()`. */
  name: string;
  /** The value given to `action()`. */
  value: string;
  /** Toggle only: the new checked state. */
  checked?: boolean;
  /** Drag only: the value of the drop target given to `dropTarget()`. */
  to?: string;
  /** The nearest enclosing anchor of the control, if any. */
  anchor?: string;
}

/** What an action handler returns. Every field is optional. */
export interface ActionResult {
  /** New text for the main file. */
  text?: string;
  /** New texts for files of a folder document, by path relative to the document. */
  files?: Record<string, string>;
  /** Text of the message sent to the agent. */
  message?: string;
}

export type ActionHandler = (doc: PluginDocument, event: ActionEvent) => ActionResult | undefined | void;

/** The object a plugin's `index.ts` default-exports through `definePlugin`. */
export interface PluginDefinition {
  /** One line shown by `adoc plugin list`. */
  description: string;
  layout: DocumentLayout;
  summarize(doc: PluginDocument): DocumentSummary;
  /** Returns the body HTML, usually built with `html` and `markdown`. */
  render(doc: PluginDocument): HtmlFragment | string;
  /**
   * Optional. Returns the body HTML that shows what changed since `previous`, an earlier version of the same document.
   * Without it, adoc shows a line diff of the main file (see `sourceDiff`).
   */
  renderChanges?(doc: PluginDocument, previous: PluginDocument): HtmlFragment | string;
  /** Handlers by action name. An action without a handler goes to adoc's default handler, which only sends a request to the agent. */
  actions?: Record<string, ActionHandler>;
  /** The agent guide in Markdown, or a URL of a Markdown file such as `new URL('./guide.md', import.meta.url)`. */
  guide: string | URL;
}

/** Trusted HTML produced by `html`, `raw` and the markup helpers. */
export class HtmlFragment {
  constructor(readonly html: string) {}
  toString(): string {
    return this.html;
  }
}
