# Third-party notices

adoc's original code and documentation use the Zero-Clause BSD License (0BSD). That license does not replace the
licenses of third-party components, and no third-party component is relicensed by this repository.

## Browser distributions

Two packages carry bundled browser code:

- `@agent-workshop/adoc-webapp`: the web UI in `dist/`. Its build records the packages actually bundled in
  `dist/licenses/packages.json` and copies their upstream LICENSE, COPYING, COPYRIGHT and NOTICE files beneath
  `dist/licenses/`.
- `@agent-workshop/adoc-plugin-sketch`: the drawing board in `client/`, with its inventory and license files in
  `client/licenses/`.

Keep these files when redistributing the built browser assets.

The main browser dependencies are React, React DOM, React Router, Mermaid (with KaTeX), xterm.js and Lucide in the web
UI, and Excalidraw with React and Radix UI in the drawing board. Most use MIT, ISC, BSD or Apache-2.0.

- DOMPurify offers MPL-2.0 OR Apache-2.0; adoc uses the Apache-2.0 option.
- Some packages are published without a license file although their manifest names one: Excalidraw, the Radix UI
  primitives, react-remove-scroll-bar and fastdom (all MIT). The build includes the upstream texts kept in
  `tooling/licenses/`.

### Eclipse Layout Kernel / elkjs

Mermaid bundles elkjs, a separately licensed layout engine, which adoc uses under EPL-2.0 without modifying it. Its
license is included in the generated license inventory. Corresponding source is available from:

- https://github.com/kieler/elkjs (select the release matching the inventory version)
- https://github.com/eclipse/elk (the underlying Eclipse Layout Kernel)
- https://www.eclipse.org/legal/epl-2.0/

Recipients may obtain, modify and redistribute the EPL-covered source under EPL-2.0. adoc's 0BSD license applies to its
independent code, not to ELK.

## Fonts

- The web UI serves Pretendard, D2Coding (both SIL Open Font License 1.1) and Symbols Nerd Font Mono; their license
  files are next to them in `dist/assets/fonts/`.
- The drawing board serves the fonts that Excalidraw ships in `client/fonts/` (Excalifont, Virgil, Nunito, Lilita One,
  Comic Shanns, Cascadia Code, Liberation Sans, Assistant and Xiaolai); they are distributed under the terms that
  Excalidraw states for them in https://github.com/excalidraw/excalidraw.

## Installed runtime dependencies

The packages that npm installs next to adoc, such as the MCP SDK, ws, yaml, zod, semver, commander, markdown-it and
highlight.js, are not bundled: each keeps its own license in its own package.
