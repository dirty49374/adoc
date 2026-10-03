import type { PluginInfo } from './api.js';
import { under } from './base.js';

const loaded = new Set<string>();

/**
 * Loads the _Plugin_Client_Module_ of every plugin that has one, once per page: its `index.css` as a stylesheet and its
 * `index.js` as a module, which defines the custom elements that the plugin's render output uses.
 */
export function loadClientModules(plugins: readonly PluginInfo[]): void {
  for (const plugin of plugins) {
    if (!plugin.client || loaded.has(plugin.key)) continue;
    loaded.add(plugin.key);
    const base = under(`/assets/plugins/${plugin.key}/`);
    if (plugin.client.style) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${base}index.css`;
      document.head.appendChild(link);
    }
    const url = `${base}index.js`;
    import(/* @vite-ignore */ url).catch((error: unknown) => console.error(`adoc: the client module of ${plugin.key} failed to load`, error));
  }
}
