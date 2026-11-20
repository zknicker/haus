import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { commandGroups } from '../apps/computer/src/agent-cli.ts';
import type { SubCommand } from '../apps/computer/src/agent-cli/subcommand.ts';
import {
    coveGuidanceConflictNotice,
    coveGuidanceRefreshNotice,
    coveTurnGuidanceNotice,
} from '../apps/computer/src/harness/cove-guidance-refresh.ts';
import { workerCommandGroups } from '../apps/computer/src/worker-cli/worker-cli.ts';
import { manualTopics, resolveManualTopic } from '../packages/agent-manual/src/index.ts';
import { renderAgentInstructions } from '../packages/agent-prompt/src/index.ts';
import { coveOnboardingPlaybook } from '../packages/agent-workspace/src/cove-factory-guidance.ts';

// A Worker turn's `haus` is its own scope (`haus worker report`), and guidance names both.
const workerGroups: Record<string, SubCommand[]> = workerCommandGroups(() => {
    throw new Error('The reference check never runs a command.');
});
const scopes: Record<string, SubCommand[]>[] = [commandGroups, workerGroups];

// Validate executable references against the registries that dispatch Agent and Worker commands.
test('Manual and Cove guidance reference registered Haus subcommands and flags', () => {
    const texts = [
        ...manualTopics.map((topic) => topic.body),
        coveOnboardingPlaybook,
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
        coveTurnGuidanceNotice('cove', 'cove')!,
        coveGuidanceRefreshNotice('cove'),
        coveGuidanceConflictNotice([], 'cove'),
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

test('Cove notices and the playbook use the same offer-state and send-status vocabulary', async () => {
    const { coveCoordinationGuidance } =
        await import('../packages/agent-workspace/src/cove-coordination-guidance.ts');
    const notice = coveTurnGuidanceNotice('cove', 'cove')!;
    const states = coveCoordinationGuidance.match(/Keep review_offer_state[^:]+: ([^.]+)\./u)![1]!;
    const playbookStates = states.split(/,\s*| or /u).map((state) => state.trim());
    const direct = [...notice.matchAll(/review_offer_state: (\w+)/gu)].map((match) => match[1]!);
    const answer = notice.match(/Write (\w+) after[^.]+, (\w+) on no, (\w+) on later\./u)!;
    expect(new Set([...direct, ...answer.slice(1)])).toEqual(new Set(playbookStates));
    const statuses = (text: string) =>
        new Set(text.match(/offer_send_status \(([^)]+)\)/u)![1]!.split(', '));
    expect(statuses(notice)).toEqual(statuses(coveCoordinationGuidance));
    expect(playbookStates).toHaveLength(5);
    expect(statuses(notice).size).toBe(5);
    expect(notice).toContain('Custom playbook or notes disabling offers take precedence');
});

test('literal recipe references in all Manual and Cove guidance resolve', () => {
    for (const body of [
        ...manualTopics.map((topic) => topic.body),
        coveOnboardingPlaybook,
        coveTurnGuidanceNotice('cove', 'cove')!,
        coveGuidanceRefreshNotice('cove'),
        coveGuidanceConflictNotice([], 'cove'),
    ]) {
        for (const [topic] of body.matchAll(/recipes\/[a-z-]+\/[a-z][a-z-]+/gu)) {
            expect(resolveManualTopic(topic), topic).not.toBeNull();
        }
    }
});
