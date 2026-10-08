import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { commandGroups } from '../apps/computer/src/agent-cli.ts';
import {
    coveGuidanceConflictNotice,
    coveGuidanceRefreshNotice,
    coveTurnGuidanceNotice,
} from '../apps/computer/src/harness/cove-guidance-refresh.ts';
import { renderAgentInstructions } from '../apps/computer/src/harness/managed-instructions.ts';
import { manualTopics, resolveManualTopic } from '../packages/agent-manual/src/index.ts';
import { coveOnboardingPlaybook } from '../packages/agent-workspace/src/cove-factory-guidance.ts';

// Validate executable references against the same registry that dispatches Agent commands.
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
        coveTurnGuidanceNotice('cove')!,
        coveGuidanceRefreshNotice,
        coveGuidanceConflictNotice([]),
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
            const commands = commandGroups[group as keyof typeof commandGroups];
            const command = commands?.find((entry) => entry.name === verb);
            expect(command, `haus ${group} ${verb}`).toBeDefined();
            const flags = new Set(['--help', ...(command?.flags ?? []).map((flag) => flag.name)]);
            for (const [flag] of tail!.split(/\bhaus /u)[0]!.matchAll(/--[a-z][a-z-]*/gu)) {
                expect(flags.has(flag), `haus ${group} ${verb} ${flag}`).toBe(true);
            }
            references += 1;
        }
    }
    expect(references).toBeGreaterThan(0);
});

test('Cove notices and the playbook use the same offer-state and send-status vocabulary', async () => {
    const { coveCoordinationGuidance } = await import(
        '../packages/agent-workspace/src/cove-coordination-guidance.ts'
    );
    const notice = coveTurnGuidanceNotice('cove')!;
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
        coveTurnGuidanceNotice('cove')!,
        coveGuidanceRefreshNotice,
        coveGuidanceConflictNotice([]),
    ]) {
        for (const [topic] of body.matchAll(/recipes\/[a-z-]+\/[a-z][a-z-]+/gu)) {
            expect(resolveManualTopic(topic), topic).not.toBeNull();
        }
    }
});
