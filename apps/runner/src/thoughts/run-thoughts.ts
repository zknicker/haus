import type { RunnerLink } from '../run-context.ts';
import { toolCategory } from '../turn/run-activity.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { describeToolAction } from './thought-action.ts';
import { createAgentThoughtNarrator } from './thought-narrator.ts';
import { createToolFindings } from './thought-result.ts';

export function createRunThoughts(input: {
    agentId: string;
    link: RunnerLink;
    now?: () => number;
    runId: string;
    schedule?: (run: () => void, ms: number) => () => void;
}) {
    const narrator = createAgentThoughtNarrator({
        emit: (thought) =>
            input.link.send({
                ...thought,
                agentId: input.agentId,
                runId: input.runId,
                type: 'agent-thought',
            }),
        ...(input.now ? { now: input.now } : {}),
        ...(input.schedule ? { schedule: input.schedule } : {}),
    });
    const findings = createToolFindings(narrator);
    return {
        close() {
            findings.clear();
            narrator.close();
        },
        observe(event: TurnEvent) {
            switch (event.type) {
                case 'reasoning-start':
                case 'reasoning-delta':
                case 'reasoning-end':
                    narrator.observe(event);
                    return;
                case 'tool-call': {
                    const category = toolCategory(event.toolName, event.input);
                    const action = describeToolAction({
                        category,
                        input: event.input,
                        toolName: event.toolName,
                    });
                    findings.started(event.toolCallId, category, action);
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
