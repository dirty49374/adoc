import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { openComments } from '../openComments.js';
import { api, pluginOf, type ActionRequest, type ReferenceInfo } from '../api.js';
import { AnchorCommentButton } from './AnchorCommentButton.js';
import { CommentPopover, type PopoverRequest } from './CommentPopover.js';
import { ReferenceTooltip } from './ReferenceTooltip.js';

type ActionEvent = ActionRequest['event'];
const DRAG_TYPE = 'application/x-adoc-drag';

interface Props {
  documentKey: string;
  html: string;
  onAction: (request: { event: ActionEvent }) => Promise<void>;
}

/**
 * _Document_Body_: shows the renderer's HTML and turns its marked elements into anchors,
 * references and actions. A newer version waits while a comment popover is open.
 */
export function DocumentBody({ documentKey, html, onAction }: Props) {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const references = useRef(new Map<string, ReferenceInfo>());
  const [shown, setShown] = useState(html);
  const [popover, setPopover] = useState<PopoverRequest>();
  const [hover, setHover] = useState<{ anchor: string; source?: string; top: number; left: number }>();
  const [tooltip, setTooltip] = useState<{ target: string; top: number; left: number }>();
  const [, setTick] = useState(0);
  const where = useLocation();

  useEffect(() => {
    if (!popover && html !== shown) setShown(html);
  }, [html, popover, shown]);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    element.innerHTML = shown;
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
    const left = openComments.get(documentKey);
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

  const act = async (event: ActionEvent) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await onAction({ event });
    } finally {
      busy.current = false;
    }
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
      void act(event);
    }
  };

  // React's onChange does not fire for inputs that innerHTML created, so toggles use a native listener.
  const toggle = useRef<(input: HTMLInputElement) => void>(() => undefined);
  toggle.current = (input) => {
    const event: ActionEvent = { kind: 'toggle', name: input.getAttribute('data-adoc-action')!, value: input.getAttribute('data-adoc-value') ?? '', checked: input.checked };
    const anchor = anchorOf(input);
    if (anchor) event.anchor = anchor;
    void act(event);
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
      const request: PopoverRequest = { target: anchor ? { level: 'anchor', key: documentKey, anchor } : { level: 'document', key: documentKey }, quote, top: p.bottom + 6, left: Math.min(Math.max(0, p.left), p.width - 380) };
      if (source) request.source = source;
      setPopover(request);
    }, 0);
  };

  const openAnchorComment = () => {
    if (!hover) return;
    const request: PopoverRequest = { target: { level: 'anchor', key: documentKey, anchor: hover.anchor }, top: hover.top + 28, left: Math.max(0, hover.left - 360) };
    if (hover.source) request.source = hover.source;
    setPopover(request);
  };

  const dropZone = (e: DragEvent) => (e.target as Element).closest('[data-adoc-drop]');
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    const control = (e.target as Element).closest('[data-adoc-kind="drag"]');
    if (!control) return;
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ name: control.getAttribute('data-adoc-action'), value: control.getAttribute('data-adoc-value') ?? '', anchor: anchorOf(control) }));
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
    const data = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '{}') as { name?: string; value?: string; anchor?: string };
    if (!data.name || data.name !== zone.getAttribute('data-adoc-drop')) return;
    const event: ActionEvent = { kind: 'drag', name: data.name, value: data.value ?? '', to: zone.getAttribute('data-adoc-drop-value') ?? '' };
    if (data.anchor) event.anchor = data.anchor;
    void act(event);
  };

  return (
    <div className="document-body" ref={container} onMouseLeave={() => setHover(undefined)}>
      {html !== shown && (
        <div className="pending-update" data-testid="pending-update">
          This document changed. The new version appears when you close the comment.
        </div>
      )}
      <div
        className="rendered"
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
      {hover && !popover && <AnchorCommentButton top={hover.top} left={hover.left} anchor={hover.anchor} onOpen={openAnchorComment} />}
      {tooltip && <ReferenceTooltip top={tooltip.top} left={tooltip.left} target={tooltip.target} info={references.current.get(tooltip.target)} />}
      {popover && (
        <CommentPopover
          documentKey={documentKey}
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
