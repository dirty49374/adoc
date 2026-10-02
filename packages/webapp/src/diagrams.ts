import { themeStore } from './theme.js';

type Mermaid = typeof import('mermaid').default;
let mermaid: Promise<Mermaid> | undefined;
let drawn = 0;

/**
 * Draws every ```mermaid block of the plugin-kit Markdown (`pre.adoc-mermaid`) inside `root` as a diagram. Mermaid
 * loads on first use; a block that fails keeps its source and shows the error below it.
 */
export async function drawDiagrams(root: HTMLElement): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>('pre.adoc-mermaid:not(.drawn)')];
  if (!blocks.length) return;
  mermaid ??= import('mermaid').then((module) => module.default);
  const library = await mermaid;
  library.initialize({ startOnLoad: false, securityLevel: 'strict', theme: themeStore.dark() ? 'dark' : 'default', fontFamily: 'Pretendard Variable, sans-serif' });
  for (const block of blocks) {
    if (!block.isConnected) continue;
    try {
      const { svg } = await library.render(`adoc-mermaid-${++drawn}`, block.textContent ?? '');
      block.innerHTML = svg;
      block.classList.add('drawn');
    } catch (error) {
      block.classList.add('drawn', 'failed');
      block.insertAdjacentHTML('afterend', `<div class="adoc-muted adoc-mermaid-error"></div>`);
      (block.nextElementSibling as HTMLElement).textContent = `Mermaid could not draw this diagram: ${(error as Error).message}`;
    }
  }
}
