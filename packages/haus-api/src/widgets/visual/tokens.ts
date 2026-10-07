import { agentHtmlTokenSnapshot } from './tokens.generated.ts';

/**
 * The published agent-HTML theme tokens as a static snapshot, for renderers
 * with no live app document to read them from (Haus Computer renders agent
 * visuals headlessly from a compiled binary).
 *
 * The website builds the same `:root` block at runtime by reading
 * `getComputedStyle(document.documentElement)` (`agentHtmlTokenCss` in
 * `apps/website/src/agent-html/tokens.ts`). Same names, same order, same
 * `:root{color-scheme:…;name: value;…}` shape; the values differ only in
 * spelling, never in rendered result: the website serializes each custom
 * property's computed value, which substitutes `var()` but keeps functions
 * such as `color-mix()` and `calc()` as written, and emits `--chart-grid` and
 * `--chart-label` as `color-mix(…var()…)` expressions. This snapshot folds all
 * of them to literals at generation time (`#43434594`, `9px`).
 */

export type AgentHtmlColorScheme = keyof typeof agentHtmlTokenSnapshot;

export type AgentHtmlTokenName = keyof (typeof agentHtmlTokenSnapshot)['dark'];

/** Every published token, resolved for one scheme, in contract order. */
export function agentHtmlTokenSnapshotValues(
    scheme: AgentHtmlColorScheme
): Readonly<Record<AgentHtmlTokenName, string>> {
    return agentHtmlTokenSnapshot[scheme];
}

/** `name: value;` declarations, one per line, like the website's runtime read. */
export function agentHtmlTokenSnapshotDeclarations(scheme: AgentHtmlColorScheme): string {
    return Object.entries(agentHtmlTokenSnapshotValues(scheme))
        .map(([name, value]) => `${name}: ${value};`)
        .join('\n');
}

/** A ready `:root { ... }` block, the same shape the website injects. */
export function agentHtmlTokenSnapshotCss(scheme: AgentHtmlColorScheme): string {
    const declarations = agentHtmlTokenSnapshotDeclarations(scheme).split('\n').join('');

    return `:root{color-scheme:${scheme};${declarations}}`;
}
