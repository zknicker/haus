import type { AgentContextSectionId, AgentContextSnapshot } from '@haus/api';

export type ContextRows = Readonly<Record<ContextRowKey, number>>;

export type HarnessContext =
    | {
          readonly compactAtTokens: number;
          readonly contextWindow: number;
          readonly kind: 'counted';
          readonly rows: ContextRows;
      }
    | {
          readonly compactAtTokens: number;
          readonly contextWindow: number;
          readonly kind: 'window';
          readonly toolTokens: number;
      };

export interface MeasuredContext {
    readonly instructions: string;
    readonly memory: string;
    readonly skillListing: string;
}

export function contextSnapshot(input: {
    harness: HarnessContext;
    measured: MeasuredContext;
    measuredAt: string;
    providerTokens: number | null;
    start: { agentId: string; modelId: string; sessionGeneration: number };
}) {
    const rows =
        input.harness.kind === 'counted'
            ? splitCountedRows(input.harness.rows, input.measured)
            : measuredRows(input.harness.toolTokens, input.measured, input.providerTokens);
    if (!rows) {
        return null;
    }
    const contextWindow = Math.max(1, Math.round(input.harness.contextWindow));
    const snapshot: AgentContextSnapshot = {
        agentId: input.start.agentId,
        compactAtTokens: clamp(Math.round(input.harness.compactAtTokens), 1, contextWindow),
        contextWindow,
        measuredAt: input.measuredAt,
        modelId: input.start.modelId,
        sections: sectionOrder.map(([id, key]) => ({ id, tokens: rows[key] })),
        sessionGeneration: input.start.sessionGeneration,
        source: input.harness.kind === 'counted' ? 'harness' : 'measured',
        usedTokens: sum(rows),
    };
    return snapshot;
}

export function estimateTokens(text: string) {
    return Math.ceil(text.length / charsPerToken);
}

type ContextRowKey = 'conversation' | 'memory' | 'skills' | 'systemPrompt' | 'tools';

const charsPerToken = 4;

const sectionOrder = [
    ['system-prompt', 'systemPrompt'],
    ['tools', 'tools'],
    ['skills', 'skills'],
    ['memory', 'memory'],
    ['conversation', 'conversation'],
] as const satisfies readonly (readonly [AgentContextSectionId, ContextRowKey])[];

function splitCountedRows(rows: ContextRows, measured: MeasuredContext) {
    const skills = Math.min(estimateTokens(measured.skillListing), rows.systemPrompt);
    const memory = Math.min(estimateTokens(measured.memory), rows.conversation);
    const split: ContextRows = {
        conversation: whole(rows.conversation - memory),
        memory: whole(rows.memory + memory),
        skills: whole(rows.skills + skills),
        systemPrompt: whole(rows.systemPrompt - skills),
        tools: whole(rows.tools),
    };
    return split;
}

function measuredRows(
    toolTokens: number,
    measured: MeasuredContext,
    providerTokens: number | null
) {
    if (providerTokens === null) {
        return null;
    }
    const skills = estimateTokens(measured.skillListing);
    const fixed = {
        memory: estimateTokens(measured.memory),
        skills,
        systemPrompt: Math.max(0, estimateTokens(measured.instructions) - skills),
        tools: toolTokens,
    };
    const fixedTotal = fixed.memory + fixed.skills + fixed.systemPrompt + fixed.tools;
    const scale = fixedTotal > providerTokens ? providerTokens / fixedTotal : 1;
    const scaled = {
        memory: whole(fixed.memory * scale),
        skills: whole(fixed.skills * scale),
        systemPrompt: whole(fixed.systemPrompt * scale),
        tools: whole(fixed.tools * scale),
    };
    const rows: ContextRows = {
        ...scaled,
        conversation: whole(
            providerTokens - scaled.memory - scaled.skills - scaled.systemPrompt - scaled.tools
        ),
    };
    return rows;
}

function sum(rows: ContextRows) {
    return rows.conversation + rows.memory + rows.skills + rows.systemPrompt + rows.tools;
}

function whole(value: number) {
    return Math.max(0, Math.floor(value));
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
