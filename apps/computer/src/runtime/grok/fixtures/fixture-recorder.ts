import type { GrokWireFrame } from '../grok-process.ts';
import { FIXTURE_PLACEHOLDERS, type FixtureFrame } from './fixture-format.ts';

/** Global Grok broadcasts that carry tips, announcements, and model catalogs: no turn signal. */
const DROPPED_METHODS = new Set([
    '_x.ai/announcements/update',
    '_x.ai/models/update',
    '_x.ai/settings/update',
]);

/** Account facts and opaque blobs that never belong in a committed fixture. */
const REDACTED_KEYS = new Set([
    'agentId',
    'agentInstanceId',
    'email',
    'hostname',
    'principal_id',
    'signature',
    'team_id',
    'user_id',
]);

/**
 * Records a driver's wire frames, scrubbed of live paths, tokens, and account facts. `values` is
 * read per frame: the host-tool token exists only once the session opens.
 */
export function createFixtureRecorder(
    values: () => {
        homeDirs: readonly string[];
        mcpToken: string;
        mcpUrl: string;
        workspaceDirs: readonly string[];
    }
) {
    const frames: FixtureFrame[] = [];
    const startedAt = Date.now();
    const scrubText = (text: string) => {
        const current = values();
        const replacements: [string, string][] = [
            [current.mcpToken, FIXTURE_PLACEHOLDERS.mcpToken],
            [current.mcpUrl, FIXTURE_PLACEHOLDERS.mcpUrl],
            ...current.workspaceDirs.map((dir): [string, string] => [
                dir,
                FIXTURE_PLACEHOLDERS.workspace,
            ]),
            // Grok names its session folder after the URL-encoded workspace.
            ...current.workspaceDirs.map((dir): [string, string] => [
                encodeURIComponent(dir),
                FIXTURE_PLACEHOLDERS.workspaceUrl,
            ]),
            ...current.homeDirs.map((dir): [string, string] => [dir, FIXTURE_PLACEHOLDERS.home]),
        ];
        return replacements
            .filter(([from]) => from.length > 0)
            .sort((a, b) => b[0].length - a[0].length)
            .reduce((result, [from, to]) => result.split(from).join(to), text);
    };
    return {
        exit(code: number) {
            frames.push({ code, dir: 'exit', ms: Date.now() - startedAt });
        },
        tap(frame: GrokWireFrame) {
            const ms = Date.now() - startedAt;
            if (frame.direction === 'stderr') {
                frames.push({ dir: 'stderr', line: scrubText(frame.line), ms });
                return;
            }
            const message = redact(JSON.parse(scrubText(frame.line))) as Record<string, unknown>;
            if (typeof message.method === 'string' && DROPPED_METHODS.has(message.method)) {
                return;
            }
            frames.push({ dir: frame.direction, message, ms });
        },
        toJsonl(): string {
            return `${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n`;
        },
    };
}

function redact(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redact);
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            REDACTED_KEYS.has(key) && item !== null ? '$REDACTED' : redact(item),
        ])
    );
}
