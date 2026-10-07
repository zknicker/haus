/**
 * The CSS variables Haus hands to agent-authored HTML.
 *
 * Agent HTML renders in a frame with an opaque origin (`agentHtmlSandbox` in
 * `@haus/api/widgets/visual/frame`), so it cannot read the app's stylesheets. Instead each surface snapshots the
 * resolved values of these tokens off the live document and injects them as a
 * `:root` block — that is what makes an agent-written page wear the app theme
 * in light and dark. Values resolve through `styles/artifact-tokens.css`,
 * mostly as aliases onto HeroUI so they track the app without an agent ever
 * writing a HeroUI name.
 *
 * `agentHtmlTokenNames` is the PUBLISHED CONTRACT and the whole of it: the
 * role vocabulary the seeded `visuals` skill teaches and the only thing any
 * agent HTML may reference. It is 38 names here plus the two derived
 * chart-chrome names appended by `agentHtmlTokenDeclarations` below — 40 taught
 * names in eight groups: type, surfaces, text, borders, emphasis, status,
 * charts, layout. There is no alias tail: nothing outside this list is
 * emitted. Renaming or removing a name is therefore a breaking change — a
 * stored visual that references it must be reauthored — so pair any change
 * with a skill update.
 *
 * Deliberately one snapshot rather than per-surface subsets: a few extra
 * declarations per frame cost nothing next to a surface silently losing a
 * token because only one copy got updated.
 */

/** The taught vocabulary: 38 snapshotted names, plus 2 derived below. */
export const agentHtmlTokenNames = [
    // Type
    '--font-sans',
    '--font-mono',
    '--app-ui-font-size',
    // Surfaces
    '--background',
    '--surface',
    '--surface-secondary',
    '--surface-tertiary',
    // Text
    '--foreground',
    '--muted-foreground',
    '--foreground-tertiary',
    // Borders
    '--border',
    '--border-strong',
    // Emphasis
    '--accent',
    '--accent-foreground',
    '--accent-bg',
    // Status
    '--success',
    '--success-foreground',
    '--success-bg',
    '--warning',
    '--warning-foreground',
    '--warning-bg',
    '--error',
    '--error-foreground',
    '--error-bg',
    // Charts (--chart-grid and --chart-label are derived, not snapshotted)
    '--chart-1',
    '--chart-2',
    '--chart-3',
    '--chart-4',
    '--chart-5',
    // Layout
    '--radius',
    '--radius-card',
    '--pad-sm',
    '--pad-md',
    '--pad-lg',
    '--gap-xs',
    '--gap-sm',
    '--gap-md',
    '--gap-lg',
] as const;

/**
 * The host variable a published name reads from, where the two differ.
 *
 * `styles/artifact-tokens.css` is the home for this mapping and owns every
 * other name. These it cannot, for two reasons:
 *
 * HeroUI declares `--accent-foreground`, `--success-foreground` and
 * `--warning-foreground` in `@layer base` — above the theme layer that file
 * imports into — and spends them as the text on solid accent, success and
 * warning Chips and Badges, where near-black or near-white on a saturated fill
 * is correct. The contract gives the same names the opposite job: text sitting
 * on the matching `-bg` tint, where those values are invisible. Rebinding them
 * for the frame keeps the contract readable without repainting the app.
 *
 * `--radius` is Tailwind's and HeroUI's own global corner basis. Declaring it in
 * `artifact-tokens.css` would either lose to `default-theme.css` or reshape
 * every `rounded-*` utility in the product, so the frame reads the
 * artifact-owned `--radius-control` under the published name instead.
 */
const hostRoleOverrides: Record<string, string> = {
    '--accent-foreground': '--accent-soft-foreground',
    '--radius': '--radius-control',
    '--success-foreground': '--success-soft-foreground',
    '--warning-foreground': '--warning-soft-foreground',
};

function hostRoleFor(name: string): string {
    return hostRoleOverrides[name] ?? name;
}

/** The app's active color scheme, so the frame matches native form controls. */
export function agentHtmlColorScheme(): 'dark' | 'light' {
    if (typeof document === 'undefined') {
        return 'dark';
    }

    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Resolved token declarations for the current theme, or '' outside a browser. */
export function agentHtmlTokenDeclarations(): string {
    if (typeof document === 'undefined' || typeof window.getComputedStyle !== 'function') {
        return '';
    }

    const computed = window.getComputedStyle(document.documentElement);
    const read = (name: string) => computed.getPropertyValue(name).trim();

    return [
        ...agentHtmlTokenNames
            .map((name) => ({ name, value: read(hostRoleFor(name)) }))
            .filter((token) => token.value.length > 0)
            .map((token) => `${token.name}: ${token.value};`),
        // Chart chrome is derived rather than snapshotted; it is part of the
        // taught vocabulary and reaches every agent-HTML surface.
        '--chart-grid: color-mix(in srgb, var(--border-strong) 58%, transparent);',
        '--chart-label: color-mix(in srgb, var(--muted-foreground) 86%, transparent);',
    ].join('\n');
}

/** A ready `:root { ... }` block for the current theme. */
export function agentHtmlTokenCss(scheme: 'dark' | 'light'): string {
    const declarations = agentHtmlTokenDeclarations();

    if (declarations.length === 0) {
        return '';
    }

    return `:root{color-scheme:${scheme};${declarations.split('\n').join('')}}`;
}

/**
 * Inject the token block into an artifact document without disturbing its
 * markup: after the opening <head> when present, otherwise prepended (the
 * parser hoists a leading <style> into head).
 */
export function injectHostTokenStyle(html: string, tokenCss: string): string {
    if (tokenCss.length === 0) {
        return html;
    }

    const styleTag = `<style data-haus-tokens>${tokenCss}</style>`;
    const headMatch = /<head[^>]*>/iu.exec(html);

    if (headMatch) {
        const insertAt = headMatch.index + headMatch[0].length;
        return `${html.slice(0, insertAt)}${styleTag}${html.slice(insertAt)}`;
    }

    return `${styleTag}${html}`;
}
