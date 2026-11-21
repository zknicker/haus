import type { AgentThoughtFrame } from '@haus/api';
import type { ComputerToolClassification } from '../activity/activity-tool-fixtures.ts';
import { toolCategory } from '../turn/run-activity.ts';
import type { ToolCallTurnEvent, TurnEvent } from '../turn/turn-event.ts';
import { describeFileChange, describeToolAction } from './thought-action.ts';
import { createAgentThoughtNarrator } from './thought-narrator.ts';
import { createThoughtRedactor } from './thought-redaction.ts';
import { createToolFindings } from './thought-result.ts';

export function createRunThoughts(input: {
    agentId: string;
    knownSecrets: Iterable<string>;
    now?: () => number;
    runId: string;
    schedule?: (run: () => void, ms: number) => () => void;
    send: (frame: AgentThoughtFrame) => void;
}) {
    const redact = createThoughtRedactor(input.knownSecrets);
    const narrator = createAgentThoughtNarrator({
        emit: (thought) =>
            input.send({
                agentId: input.agentId,
                runId: input.runId,
                ...thought,
                type: 'agent-thought',
            }),
        now: input.now,
        redact,
        schedule: input.schedule,
    });
    const findings = createToolFindings(narrator);
    return {
        close() {
            narrator.close();
            findings.clear();
        },
        observe(event: TurnEvent) {
            switch (event.type) {
                case 'reasoning-start':
                case 'reasoning-delta':
                case 'reasoning-end':
                    narrator.observe(event);
                    return;
                case 'tool-call': {
                    const classification = classifyToolCall(event);
                    const redacted = { ...event, input: redactStrings(event.input, redact) };
                    findings.started(
                        event.toolCallId,
                        { input: event.input, toolName: event.toolName },
                        describeRunnerToolAction(redacted, classification)
                    );
                    return;
                }
                case 'tool-result':
                    findings.finished(event.toolCallId, event.output, event.isError === true);
                    return;
                case 'tool-error':
                    findings.finished(event.toolCallId, null, true);
                    return;
                default:
                    return;
            }
        },
    };
}

function classifyToolCall(event: ToolCallTurnEvent) {
    const category = event.invalid ? null : toolCategory(event.toolName, event.input);
    const classification: ComputerToolClassification =
        category === null || category === 'received_message'
            ? { outcome: 'skip' }
            : { category, outcome: 'activity' };
    return classification;
}

function describeRunnerToolAction(
    event: ToolCallTurnEvent,
    classification: ComputerToolClassification
) {
    if (event.toolName === 'apply_patch' && classification.outcome === 'activity') {
        return describeFileChange(patchFileChange(event.input));
    }
    return describeToolAction({
        classification,
        input: event.input,
        toolName: event.toolName,
    });
}

function patchFileChange(input: unknown) {
    const patch =
        typeof input === 'object' && input !== null && 'input' in input ? input.input : null;
    const match =
        typeof patch === 'string' ? /^\*\*\* (Add|Delete|Update) File: (.+)$/mu.exec(patch) : null;
    return match ? { event: match[1]?.toLowerCase(), path: match[2]?.trim() } : null;
}

function redactStrings(value: unknown, redact: (text: string) => string) {
    const redacted: unknown =
        value === undefined
            ? undefined
            : JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
                  typeof item === 'string' ? redact(item) : item
              );
    return redacted;
}
