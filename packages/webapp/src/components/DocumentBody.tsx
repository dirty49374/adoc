import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { openComments } from '../openComments.js';
import { api, formatTarget, pluginOf, type ActionRequest, type ActionResponse, type ReferenceInfo, type Subject } from '../api.js';
import { ActionConfirmDialog } from './ActionConfirmDialog.js';
import { AnchorCommentButton } from './AnchorCommentButton.js';
import { CommentPopover, type PopoverRequest } from './CommentPopover.js';
import { DraftMarkerColumn } from './DraftMarkerColumn.js';
import { drawDiagrams } from '../diagrams.js';
import { draftStore, type DraftComment } from '../drafts.js';
import { ReferenceTooltip } from './ReferenceTooltip.js';
import { readStored, writeStored } from '../storage.js';

type ActionEvent = ActionRequest['event'];
const DRAG_TYPE = 'application/x-adoc-drag';
/** The actions, as `<plugin key> <action name>`, whose confirmation the user turned off in this browser. */
const CONFIRM_OFF = 'confirm-off';

interface Props {
  /** The document (or skill) the body shows. */
  subject: Subject;
  html: string;
  /** Absent for a body without actions, such as a skill. */
  onAction?: (request: { event: ActionEvent }) => Promise<ActionResponse | undefined>;
}

/**
 * _Document_Body_: shows the renderer's HTML and turns its marked elements into anchors,
 * references and actions. A newer version waits while a comment popover is open.
 */
export function DocumentBody({ subject, html, onAction }: Props) {
  const subjectKey = formatTarget(subject);
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const references = useRef(new Map<string, ReferenceInfo>());
  const [shown, setShown] = useState(html);
  const [popover, setPopover] = useState<PopoverRequest>();
  const [hover, setHover] = useState<{ anchor: string; source?: string; top: number; left: number }>();
  const [tooltip, setTooltip] = useState<{ target: string; top: number; left: number }>();
  const [confirming, setConfirming] = useState<{ question: string; event: ActionEvent }>();
  const [, setTick] = useState(0);
  const where = useLocation();

  useEffect(() => {
    if (!popover && html !== shown) setShown(html);
  }, [html, popover, shown]);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    element.innerHTML = shown;
    void drawDiagrams(element);
    references.current.clear();
    const hash = decodeURIComponent(where.hash.slice(1));
    if (hash) {
      const target = element.querySelector(`[data-adoc-anchor="${CSS.escape(hash)}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.classList.add('adoc-flash');
        window.setTimeout(() => target.classList.remove('adoc-flash'), 1600);
      }
    }
    const left = openComments.get(subjectKey);
    if (left && !popover) {
      const anchor = left.target.level === 'anchor' ? element.querySelector(`[data-adoc-anchor="${CSS.escape(left.target.anchor)}"]`) : null;
      const box = container.current!.getBoundingClientRect();
      const rect = (anchor ?? element).getBoundingClientRect();
      const request: PopoverRequest = { target: left.target, text: left.text, top: rect.bottom - box.top + 6, left: Math.max(0, Math.min(rect.left - box.left, box.width - 380)) };
      if (left.quote) request.quote = left.quote;
      if (left.source) request.source = left.source;
      setPopover(request);
    }
    const targets = [...new Set([...element.querySelectorAll('[data-adoc-ref]')].map((e) => e.getAttribute('data-adoc-ref')!))];
    if (!targets.length) return;
    api.references(targets).then(({ references: infos }) => {
      for (const info of infos) references.current.set(info.target, info);
      for (const ref of element.querySelectorAll('[data-adoc-ref]')) {
        ref.classList.toggle('adoc-ref-broken', references.current.get(ref.getAttribute('data-adoc-ref')!)?.found === false);
      }
      setTick((t) => t + 1);
    }, () => undefined);
  }, [shown, where.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const position = (rect: DOMRect) => {
    const base = container.current!.getBoundingClientRect();
    return { top: rect.top - base.top, left: rect.left - base.left, bottom: rect.bottom - base.top, width: base.width };
  };

  /** Sends one action at a time; an action while another is running is dropped and answered `busy`. */
  const act = async (event: ActionEvent): Promise<ActionResponse | { status: 'busy' } | undefined> => {
    if (busy.current) return { status: 'busy' };
    busy.current = true;
    try {
      return await onAction?.({ event });
    } finally {
      busy.current = false;
    }
  };

  const confirmKey = (event: ActionEvent) => `${subject.level === 'document' ? pluginOf(subject.key) : 'skill'} ${event.name}`;

  /** Sends the action, after the _Action_Confirm_Dialog_ when its control asks a question the user did not turn off. */
  const send = (question: string | null | undefined, event: ActionEvent) => {
    if (question && !readStored<string[]>(CONFIRM_OFF, []).includes(confirmKey(event))) setConfirming({ question, event });
    else void act(event);
  };

  const confirmed = (dontAskAgain: boolean) => {
    if (!confirming) return;
    if (dontAskAgain) writeStored(CONFIRM_OFF, [...new Set([...readStored<string[]>(CONFIRM_OFF, []), confirmKey(confirming.event)])]);
    setConfirming(undefined);
    void act(confirming.event);
  };

  const anchorOf = (element: Element) => element.closest('[data-adoc-anchor]')?.getAttribute('data-adoc-anchor') ?? undefined;

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const ref = target.closest('[data-adoc-ref]');
    if (ref) {
      e.preventDefault();
      const key = ref.getAttribute('data-adoc-ref')!.split('#')[0]!;
      navigate(`/p/${pluginOf(key)}/${key}`);
      return;
    }
    const control = target.closest('[data-adoc-kind="click"]');
    if (control) {
      e.preventDefault();
      const event: ActionEvent = { kind: 'click', name: control.getAttribute('data-adoc-action')!, value: control.getAttribute('data-adoc-value') ?? '' };
      const anchor = anchorOf(control);
      if (anchor) event.anchor = anchor;
      send(control.getAttribute('data-adoc-confirm'), event);
    }
  };

  // React's onChange does not fire for inputs that innerHTML created, so toggles use a native listener.
  const toggle = useRef<(input: HTMLInputElement) => void>(() => undefined);
  toggle.current = (input) => {
    const event: ActionEvent = { kind: 'toggle', name: input.getAttribute('data-adoc-action')!, value: input.getAttribute('data-adoc-value') ?? '', checked: input.checked };
    // The checkbox shows the file: undo the browser's change; the new state appears when the document changes.
    input.checked = !input.checked;
    const anchor = anchorOf(input);
    if (anchor) event.anchor = anchor;
    send(input.getAttribute('data-adoc-confirm'), event);
  };
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const listener = (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.getAttribute?.('data-adoc-kind') === 'toggle') toggle.current(input);
    };
    element.addEventListener('change', listener);
    return () => element.removeEventListener('change', listener);
  }, []);

  // Elements of a plugin client module: `adoc-action` becomes a Document_Action (answered through `detail.reply`),
  // `adoc-draft` puts the element's one draft on this document.
  const elementAction = useRef<(e: Event) => void>(() => undefined);
  elementAction.current = (e) => {
    const detail = (e as CustomEvent<{ name?: unknown; value?: unknown; reply?: (outcome: unknown) => void }>).detail;
    if (typeof detail?.name !== 'string') return;
    const event: ActionEvent = { kind: 'client', name: detail.name, value: typeof detail.value === 'string' ? detail.value : '' };
    const anchor = anchorOf(e.target as Element);
    if (anchor) event.anchor = anchor;
    void act(event).then((outcome) => detail.reply?.(outcome ?? { status: 'failed', error: 'the document is not shown' }));
  };
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    const onAction = (e: Event) => elementAction.current(e);
    const onDraft = (e: Event) => {
      const text = (e as CustomEvent<{ text?: unknown }>).detail?.text;
      if (typeof text === 'string' && text.trim()) draftStore.putOwnDraft('element', subject, text);
    };
    element.addEventListener('adoc-action', onAction);
    element.addEventListener('adoc-draft', onDraft);
    return () => {
      element.removeEventListener('adoc-action', onAction);
      element.removeEventListener('adoc-draft', onDraft);
    };
  }, []);

  const onMouseOver = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const anchorElement = target.closest('[data-adoc-anchor]');
    if (anchorElement && content.current?.contains(anchorElement)) {
      const p = position(anchorElement.getBoundingClientRect());
      const source = anchorElement.closest('[data-adoc-source]') ?? anchorElement.querySelector('[data-adoc-source]');
      const next: { anchor: string; source?: string; top: number; left: number } = { anchor: anchorElement.getAttribute('data-adoc-anchor')!, top: p.top, left: p.width - 30 };
      const sourceValue = source?.getAttribute('data-adoc-source');
      if (sourceValue) next.source = sourceValue;
      setHover(next);
    }
    const ref = target.closest('[data-adoc-ref]');
    if (ref) {
      const p = position(ref.getBoundingClientRect());
      setTooltip({ target: ref.getAttribute('data-adoc-ref')!, top: p.bottom + 4, left: Math.max(0, p.left) });
    }
  };

  const onMouseOut = (e: MouseEvent<HTMLDivElement>) => {
    const ref = (e.target as Element).closest('[data-adoc-ref]');
    if (ref && !ref.contains(e.relatedTarget as Node | null)) setTooltip(undefined);
  };

  const onMouseUp = () => {
    window.setTimeout(() => {
      if (popover) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const quote = selection.toString().trim();
      const range = selection.getRangeAt(0);
      if (!quote || !content.current?.contains(range.commonAncestorContainer)) return;
      const common = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement!;
      const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement!;
      const anchor = anchorOf(common);
      const source = start.closest('[data-adoc-source]')?.getAttribute('data-adoc-source') ?? undefined;
      const p = position(range.getBoundingClientRect());
      const request: PopoverRequest = { target: anchor && subject.level === 'document' ? { level: 'anchor', key: subject.key, anchor } : subject, quote, top: p.bottom + 6, left: Math.min(Math.max(0, p.left), p.width - 380) };
      if (source) request.source = source;
      setPopover(request);
    }, 0);
  };

  const openAnchorComment = () => {
    if (!hover || subject.level !== 'document') return;
    const request: PopoverRequest = { target: { level: 'anchor', key: subject.key, anchor: hover.anchor }, top: hover.top + 28, left: Math.max(0, hover.left - 360) };
    if (hover.source) request.source = hover.source;
    setPopover(request);
  };

  /** ✎ on a draft card: reopens the popover with the draft's text and removes the draft until it is added again. */
  const editDraft = (draft: DraftComment) => {
    const element = draft.target.level === 'anchor' ? content.current?.querySelector(`[data-adoc-anchor="${CSS.escape(draft.target.anchor)}"]`) : null;
    const box = container.current!.getBoundingClientRect();
    const rect = (element ?? content.current!).getBoundingClientRect();
    const request: PopoverRequest = { target: draft.target, text: draft.text, top: rect.bottom - box.top + 6, left: Math.max(0, Math.min(rect.left - box.left, box.width - 380)) };
    if (draft.quote) request.quote = draft.quote;
    if (draft.source) request.source = draft.source;
    draftStore.remove(draft.id);
    setPopover(request);
  };

  const dropZone = (e: DragEvent) => (e.target as Element).closest('[data-adoc-drop]');
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    const control = (e.target as Element).closest('[data-adoc-kind="drag"]');
    if (!control) return;
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ name: control.getAttribute('data-adoc-action'), value: control.getAttribute('data-adoc-value') ?? '', anchor: anchorOf(control), confirm: control.getAttribute('data-adoc-confirm') }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    const zone = dropZone(e);
    if (!zone || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    zone.classList.add('adoc-drop-over');
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    const zone = dropZone(e);
    if (zone && !zone.contains(e.relatedTarget as Node | null)) zone.classList.remove('adoc-drop-over');
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const zone = dropZone(e);
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('adoc-drop-over');
    const data = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '{}') as { name?: string; value?: string; anchor?: string; confirm?: string | null };
    if (!data.name || data.name !== zone.getAttribute('data-adoc-drop')) return;
    const event: ActionEvent = { kind: 'drag', name: data.name, value: data.value ?? '', to: zone.getAttribute('data-adoc-drop-value') ?? '' };
    if (data.anchor) event.anchor = data.anchor;
    send(data.confirm, event);
  };

  return (
    <div className="document-body" ref={container} onMouseLeave={() => setHover(undefined)}>
      {html !== shown && (
        <div className="pending-update adoc-block adoc-tone-info" data-testid="pending-update">
          This document changed. The new version appears when you close the comment.
        </div>
      )}
      <div
        className="rendered"
        translate="yes"
        ref={content}
        data-testid="document-body"
        onClick={onClick}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
        onMouseUp={onMouseUp}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      />
      <DraftMarkerColumn subject={subject} content={content.current} container={container.current} html={shown} onEdit={editDraft} />
      {hover && !popover && <AnchorCommentButton top={hover.top} left={hover.left} anchor={hover.anchor} onOpen={openAnchorComment} />}
      {tooltip && <ReferenceTooltip top={tooltip.top} left={tooltip.left} target={tooltip.target} info={references.current.get(tooltip.target)} />}
      {confirming && <ActionConfirmDialog question={confirming.question} onConfirm={confirmed} onCancel={() => setConfirming(undefined)} />}
      {popover && (
        <CommentPopover
          subject={subject}
          request={popover}
          onClose={() => {
            setPopover(undefined);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </div>
  );
}
