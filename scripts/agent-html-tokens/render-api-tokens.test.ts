import { describe, expect, test } from 'bun:test';
import { agentHtmlTokenNames } from '../../apps/website/src/agent-html/tokens.ts';
import {
    agentHtmlTokenSnapshotCss,
    agentHtmlTokenSnapshotDeclarations,
} from '../../packages/haus-api/src/widgets/visual/tokens.ts';
import {
    API_OUTPUT_PATH,
    type ResolvedTables,
    type ResolvedToken,
    renderApiTokensSource,
} from './render-api-tokens.ts';

/**
 * Drift gate for the `@haus/api` token snapshot, in `test:fast`.
 *
 * Resolving the stylesheets needs the licensed Pro dist, so the
 * stylesheet-to-table check lives with the Swift table's drift test in
 * `apps/website/src/agent-html/generate-ios-tokens.test.ts` (`test:app-unit`).
 * This proves the other half offline: the checked-in snapshot is exactly what
 * the generator renders from the checked-in Swift table, so the two stay one
 * generation, and a stale Swift table fails the heavy gate for both.
 */
const SWIFT_PATH = new URL(
    '../../apps/ios-swift/Sources/HausUI/Visuals/AgentHtmlTokens.generated.swift',
    import.meta.url
).pathname;

const publishedNames = [...agentHtmlTokenNames, '--chart-grid', '--chart-label'];

describe('agent-html @haus/api token snapshot', () => {
    test('the checked-in snapshot matches a render of the checked-in Swift table', async () => {
        const tables = parseSwiftTables(await Bun.file(SWIFT_PATH).text());
        const checkedIn = await Bun.file(API_OUTPUT_PATH).text();

        expect(checkedIn).toBe(renderApiTokensSource(tables));
    });

    test('both schemes publish exactly the contract names, in order', async () => {
        const tables = parseSwiftTables(await Bun.file(SWIFT_PATH).text());

        for (const scheme of ['dark', 'light'] as const) {
            expect(tables[scheme].map((token) => token.name)).toEqual(publishedNames);
            const declared = agentHtmlTokenSnapshotDeclarations(scheme)
                .split('\n')
                .map((line) => line.slice(0, line.indexOf(':')));
            expect(declared).toEqual(publishedNames);
        }
    });

    test('the :root block has the website shape and no unresolved expression', () => {
        const dark = agentHtmlTokenSnapshotCss('dark');
        const light = agentHtmlTokenSnapshotCss('light');

        expect(dark.startsWith(':root{color-scheme:dark;--font-sans: ')).toBe(true);
        expect(light.startsWith(':root{color-scheme:light;--font-sans: ')).toBe(true);
        expect(dark).toContain('--radius: 9px;');
        expect(dark.endsWith('--chart-label: #9f9fa9db;}')).toBe(true);
        expect(light).not.toBe(dark);
        for (const css of [dark, light]) {
            expect(css).not.toContain('var(');
            expect(css).not.toContain('calc(');
            expect(css).not.toContain('color-mix(');
        }
    });
});

/** Read the generated Swift table back into resolved tokens per scheme. */
function parseSwiftTables(source: string): ResolvedTables {
    const lightStart = source.indexOf('public static let light');

    return {
        dark: parseSwiftEntries(source.slice(0, lightStart)),
        light: parseSwiftEntries(source.slice(lightStart)),
    };
}

function parseSwiftEntries(source: string): ResolvedToken[] {
    const swiftString = String.raw`"((?:[^"\\]|\\.)*)"`;
    const entry = new RegExp(
        `AgentHtmlToken\\(name: ${swiftString}, value: ${swiftString}\\)`,
        'g'
    );

    return [...source.matchAll(entry)].map((match) => ({
        name: unescapeSwift(match[1] ?? ''),
        value: unescapeSwift(match[2] ?? ''),
    }));
}

function unescapeSwift(value: string): string {
    return value.replace(/\\(["\\])/g, '$1');
}
