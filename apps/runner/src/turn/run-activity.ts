import {
    type AgentActivityCategory,
    type AgentActivityFrame,
    type AgentTurnActivitySummary,
    type AgentTurnOperationCategory,
    agentTurnOperationCategorySchema,
} from '@haus/api';
import { isHausCliCommand } from '@haus/api/haus-cli-command';
import { compactionToolName, type TurnEvent } from './turn-event.ts';

type TerminalPhase = 'completed' | 'failed' | 'interrupted';

const countedCategories = new Set<string>(agentTurnOperationCategorySchema.options);

function isCounted(category: string): category is AgentTurnOperationCategory {
    return countedCategories.has(category);
}

export function createRunActivity(input: {
    agentId: string;
    now: () => number;
    runId: string;
    send: (frame: AgentActivityFrame) => void;
}) {
    const active = new Map<string, AgentActivityCategory>();
    const counts = new Map<AgentTurnOperationCategory, Record<TerminalPhase, number>>();
    let sequence = 0;
    let closed = false;
    const emit = (category: AgentActivityCategory, phase: AgentActivityFrame['phase']) => {
        sequence += 1;
        input.send({
            agentId: input.agentId,
            category,
            occurredAt: new Date(input.now()).toISOString(),
            phase,
            producerSequence: sequence,
            runId: input.runId,
            type: 'agent-activity',
        });
    };
    const start = (key: string, category: AgentActivityCategory) => {
        if (closed || active.has(key)) {
            return;
        }
        active.set(key, category);
        emit(category, 'started');
    };
    const finish = (key: string, phase: TerminalPhase) => {
        const category = active.get(key);
        if (!category) {
            return;
        }
        active.delete(key);
        if (isCounted(category)) {
            const counted = category;
            const current = counts.get(counted) ?? { completed: 0, failed: 0, interrupted: 0 };
            counts.set(counted, { ...current, [phase]: current[phase] + 1 });
        }
        emit(category, phase);
    };
    return {
        close(phase: TerminalPhase) {
            for (const key of [...active.keys()]) {
                finish(key, phase);
            }
            closed = true;
        },
        finish,
        observe(event: TurnEvent) {
            if (event.type === 'tool-call') {
                const category = toolCategory(event.toolName, event.input);
                if (category) {
                    start(`tool:${event.toolCallId}`, category);
                }
            } else if (event.type === 'tool-result' || event.type === 'tool-error') {
                const failed = event.type === 'tool-error' || event.isError === true;
                finish(`tool:${event.toolCallId}`, failed ? 'failed' : 'completed');
            }
        },
        snapshot() {
            const summary: AgentTurnActivitySummary = {
                operations: agentTurnOperationCategorySchema.options.flatMap((category) => {
                    const counted = counts.get(category);
                    return counted ? [{ category, ...counted }] : [];
                }),
            };
            return summary;
        },
        start,
    };
}

export function toolCategory(toolName: string, input: unknown) {
    const categories: Readonly<Record<string, AgentActivityCategory>> = {
        WebFetch: 'browsing',
        apply_patch: 'editing_files',
        execute: 'using_tool',
        view_image: 'reading_files',
        web_fetch: 'browsing',
        web_search: 'searching_web',
        webSearch: 'searching_web',
    };
    if (toolName === compactionToolName) {
        return null;
    }
    if (toolName === 'bash' || toolName === 'shell') {
        return isHausCliCommand(input) ? null : 'running_command';
    }
    if (toolName === 'str_replace_based_edit_tool') {
        return commandOf(input) === 'view' ? 'reading_files' : 'editing_files';
    }
    return categories[toolName] ?? 'using_tool';
}

function commandOf(input: unknown) {
    return typeof input === 'object' && input !== null && 'command' in input
        ? input.command
        : undefined;
}
