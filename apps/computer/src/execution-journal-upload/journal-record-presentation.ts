/**
 * Shapes one journal record for upload, on the Computer, before it leaves:
 * Agent paths read relative to the workspace (`~` for home) so host usernames
 * and Server and Agent ids stay local, credentials are masked, and strings
 * PostgreSQL `jsonb` cannot hold (NUL, lone surrogates) are replaced.
 */
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import {
    EXECUTION_JOURNAL_REASONING_MAX_CHARS,
    EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS,
    type ExecutionJournalResult,
    type ExecutionJournalTool,
    type ExecutionJournalUploadRecord,
    type ExecutionJournalValue,
} from '@haus/api';
import type { JournalRecord } from '../harness/execution-journal-records.ts';
import { createJournalRedactor, isSecretKey } from './journal-redaction.ts';
import { whenMissing } from './journal-upload-ledger.ts';

export type JournalRecordPresenter = (record: JournalRecord) => ExecutionJournalUploadRecord[];

/**
 * One Agent's presenter. Its known secrets are the Computer's own plus the
 * Agent's loopback token, so an echoed credential is masked exactly.
 */
export async function createJournalRecordPresenter(input: {
    agentRoot: string;
    knownSecrets: readonly string[];
}): Promise<JournalRecordPresenter> {
    const proxyToken = await readFile(join(input.agentRoot, 'runtime', 'proxy-token'), 'utf8')
        .then((token) => token.trim())
        .catch(whenMissing(''));
    const redact = createJournalRedactor([...input.knownSecrets, proxyToken]);
    const relativize = pathRelativizer(await agentPathAliases(input.agentRoot));
    return presentJournalRecord((text) => wellFormed(relativize(redact(text))));
}

/** The record presenter for one string mapping; exported for tests. */
export function presentJournalRecord(text: (value: string) => string): JournalRecordPresenter {
    const value = (input: ExecutionJournalValue | undefined) => mapValue(input, text);
    const label = (input: string) => clip(text(input), EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS);
    const result = (input: ExecutionJournalResult | undefined) =>
        input && { ...input, error: value(input.error), output: value(input.output) };
    const tool = (input: ExecutionJournalTool): ExecutionJournalTool => ({
        ...input,
        error: value(input.error),
        final: result(input.final),
        input: value(input.input),
        output: value(input.output),
        preliminary: result(input.preliminary),
        subagent: input.subagent && {
            ...input.subagent,
            label: label(input.subagent.label),
            latestAction: input.subagent.latestAction && label(input.subagent.latestAction),
        },
    });
    const reasoning = (input: string) => clip(text(input), EXECUTION_JOURNAL_REASONING_MAX_CHARS);
    return (record) => {
        switch (record.type) {
            case 'open': {
                const { reasoning: blocks, tools, ...header } = record.document;
                return [
                    {
                        document: { ...header, error: value(header.error), tools: [] },
                        type: 'open',
                    },
                    ...tools.map((entry) => ({ tool: tool(entry), type: 'tool' as const })),
                    ...(blocks ?? []).map((block) => ({
                        block: { ...block, text: reasoning(block.text) },
                        type: 'reasoning' as const,
                    })),
                ];
            }
            case 'tool-call':
                return [{ ...record, input: value(record.input) }];
            case 'tool-result':
                return [{ ...record, output: value(record.output) }];
            case 'subagent':
                return [
                    {
                        ...record,
                        patch: {
                            ...record.patch,
                            label: record.patch.label && label(record.patch.label),
                            latestAction:
                                record.patch.latestAction && label(record.patch.latestAction),
                        },
                    },
                ];
            case 'reasoning-append':
                return [{ ...record, text: text(record.text) }];
            case 'interrupt':
            case 'finish':
                return [{ ...record, error: value(record.error) }];
            default:
                return [record];
        }
    };
}

/** A value whose secret-named fields lose their string values outright. */
function mapValue(
    value: ExecutionJournalValue | undefined,
    text: (value: string) => string
): ExecutionJournalValue | undefined {
    if (typeof value === 'string') {
        return text(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => mapValue(item, text) ?? null);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                wellFormed(key),
                typeof item === 'string' && item.length > 0 && isSecretKey(key)
                    ? '[redacted]'
                    : (mapValue(item, text) ?? null),
            ])
        );
    }
    return value;
}

/**
 * One absolute Agent directory and what a reader sees in its place: `bare` for the
 * directory itself, `prefix` before a path inside it. The workspace matches the
 * harness patch (`<workspace>`, and inner paths lose the prefix); home reads `~`.
 */
interface PathAlias {
    readonly bare: string;
    readonly prefix: string;
    readonly root: string;
}

/** The workspace and home, each also under its resolved path (macOS `/private/var`). */
async function agentPathAliases(agentRoot: string): Promise<PathAlias[]> {
    const directories: PathAlias[] = [
        { bare: '<workspace>', prefix: '', root: join(agentRoot, 'workspace') },
        { bare: '~', prefix: '~/', root: join(agentRoot, 'home') },
    ];
    const aliases: PathAlias[] = [];
    for (const directory of directories) {
        aliases.push(directory);
        const resolved = await realpath(directory.root).catch(whenMissing(directory.root));
        if (resolved !== directory.root) {
            aliases.push({ ...directory, root: resolved });
        }
    }
    return aliases;
}

export function pathRelativizer(aliases: readonly PathAlias[]): (value: string) => string {
    const patterns = aliases.map(({ bare, prefix, root }) => ({
        bare,
        prefix,
        // The root itself, or the root followed by a path separator; never a sibling
        // such as `workspace-old`.
        pattern: new RegExp(`${escapeRegExp(root)}(/|(?![\\w.-]))`, 'gu'),
    }));
    return (value) =>
        patterns.reduce(
            (text, { bare, pattern, prefix }) =>
                text.includes('/')
                    ? text.replace(pattern, (_match, slash: string) => (slash ? prefix : bare))
                    : text,
            value
        );
}

/** PostgreSQL `jsonb` rejects NUL and unpaired surrogates. */
function wellFormed(value: string): string {
    return value
        .replaceAll('\u0000', '')
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu, '�');
}

function clip(value: string, max: number): string {
    return value.length > max ? value.slice(0, max) : value;
}

function escapeRegExp(value: string): string {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
