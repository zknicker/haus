import * as z from 'zod';

/**
 * One recorded ACP frame: `out` is Haus → Grok, `in` is Grok → Haus, `stderr` is a Grok log line,
 * and `exit` ends a replay the way the recorded process ended. Live values are scrubbed to the
 * placeholders below; the replay substitutes the test's own.
 */
export const fixtureFrameSchema = z.discriminatedUnion('dir', [
    z.object({ dir: z.literal('out'), message: z.record(z.string(), z.unknown()), ms: z.number() }),
    z.object({ dir: z.literal('in'), message: z.record(z.string(), z.unknown()), ms: z.number() }),
    z.object({ dir: z.literal('stderr'), line: z.string(), ms: z.number() }),
    z.object({ code: z.number(), dir: z.literal('exit'), ms: z.number() }),
]);

export type FixtureFrame = z.infer<typeof fixtureFrameSchema>;

export const FIXTURE_PLACEHOLDERS = {
    home: '$HOME_DIR',
    mcpToken: '$MCP_TOKEN',
    mcpUrl: '$MCP_URL',
    workspace: '$WORKSPACE',
    workspaceUrl: '$WORKSPACE_URL',
} as const;

export function parseFixture(text: string): FixtureFrame[] {
    return text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => fixtureFrameSchema.parse(JSON.parse(line)));
}

/** Replaces each placeholder, longest first (`$WORKSPACE_URL` before `$WORKSPACE`). */
export function fillPlaceholders(text: string, values: Readonly<Record<string, string>>): string {
    return Object.entries(values)
        .sort((a, b) => b[0].length - a[0].length)
        .reduce((current, [placeholder, value]) => current.split(placeholder).join(value), text);
}
