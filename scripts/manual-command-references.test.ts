import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { commandGroups } from '../apps/computer/src/agent-cli.ts';
import type { SubCommand } from '../apps/computer/src/agent-cli/subcommand.ts';
import { workerCommandGroups } from '../apps/computer/src/worker-cli/worker-cli.ts';
import { manualTopics, resolveManualTopic } from '../packages/agent-manual/src/index.ts';
import { renderAgentInstructions } from '../packages/agent-prompt/src/index.ts';

// A Worker turn's `haus` is its own scope (`haus worker report`), and guidance names both.
const workerGroups: Record<string, SubCommand[]> = workerCommandGroups(() => {
    throw new Error('The reference check never runs a command.');
});
const scopes: Record<string, SubCommand[]>[] = [commandGroups, workerGroups];

// Validate executable references against the registries that dispatch Agent and Worker commands.
test('Manual and prompt guidance reference registered Haus subcommands and flags', () => {
    const texts = [
        ...manualTopics.map((topic) => topic.body),
        renderAgentInstructions({
            agentId: 'test',
            agentName: 'Test',
            homeTimezone: 'UTC',
            hostname: 'test',
            initialRole: null,
            os: 'test',
            runtimeVersion: 'test',
            workspacePath: '/workspace',
        }),
    ];
    let references = 0;
    const recovery = [
        '../apps/server/src/agent-api/reminder-routes.ts',
        '../apps/server/src/server-agents/creation-guidance.ts',
    ].flatMap((path) =>
        [
            ...readFileSync(new URL(path, import.meta.url), 'utf8').matchAll(
                /'([^'\n]*haus [^'\n]+)'/gu
            ),
        ].map((match) => match[1]!)
    );
    for (const text of [
        ...recovery,
        ...texts.flatMap((body) =>
            [...body.matchAll(/`([^`]+)`/gu)].map((match) => match[1]!.replace(/\s+/gu, ' '))
        ),
    ]) {
        for (const [, group, verb, tail] of text.matchAll(
            /\bhaus ([a-z-]+) ([a-z-]+)([^\n`]*)/gu
        )) {
            // A flag in verb position addresses the group's bare action (`haus claim --target …`).
            const bare = verb!.startsWith('-');
            const command = scopes
                .flatMap((scope) => scope[group!] ?? [])
                .find((entry) => (bare ? entry.bare : !entry.bare && entry.name === verb));
            expect(command, `haus ${group} ${verb}`).toBeDefined();
            const flags = new Set(['--help', ...(command?.flags ?? []).map((flag) => flag.name)]);
            const flagText = bare ? `${verb}${tail}` : tail!;
            for (const [flag] of flagText.split(/\bhaus /u)[0]!.matchAll(/--[a-z][a-z-]*/gu)) {
                expect(flags.has(flag), `haus ${group} ${verb} ${flag}`).toBe(true);
            }
            references += 1;
        }
    }
    expect(references).toBeGreaterThan(0);
});

test('literal recipe references in all Manual guidance resolve', () => {
    for (const body of manualTopics.map((topic) => topic.body)) {
        for (const [topic] of body.matchAll(/recipes\/[a-z-]+\/[a-z][a-z-]+/gu)) {
            expect(resolveManualTopic(topic), topic).not.toBeNull();
        }
    }
});
