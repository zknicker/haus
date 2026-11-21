import type { AgentContextSectionId, AgentContextSnapshot, Chat } from '@haus/api';

export interface ContextUsageRow {
    readonly color: string;
    readonly id: AgentContextSectionId;
    readonly label: string;
    readonly share: number;
    readonly tokens: string;
}

export function contextUsageView(snapshot: AgentContextSnapshot) {
    const percent = Math.round((snapshot.usedTokens / snapshot.compactAtTokens) * 100);
    const rows: ContextUsageRow[] = snapshot.sections.map((section) => ({
        color: sectionColors[section.id],
        id: section.id,
        label: sectionLabels[section.id],
        share: Math.min(1, section.tokens / snapshot.compactAtTokens),
        tokens: formatTokens(section.tokens),
    }));
    return {
        compactAt: formatTokens(snapshot.compactAtTokens),
        percent,
        rows,
        summary: `${formatTokens(snapshot.usedTokens)} / ${formatTokens(snapshot.compactAtTokens)} used (${percent}%)`,
        window: formatTokens(snapshot.contextWindow),
    };
}

export function chatCaptainId(chat: Pick<Chat, 'participantAgentIds' | 'peerAgentId'>) {
    if (chat.peerAgentId) {
        return chat.peerAgentId;
    }
    return chat.participantAgentIds.length === 1 ? (chat.participantAgentIds[0] ?? null) : null;
}

export function formatTokens(tokens: number) {
    return tokenFormat.format(tokens);
}

const tokenFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1, notation: 'compact' });

const sectionLabels: Record<AgentContextSectionId, string> = {
    conversation: 'Conversation',
    memory: 'Rules and memory',
    skills: 'Skills',
    'system-prompt': 'System prompt',
    tools: 'Tools',
};

const sectionColors: Record<AgentContextSectionId, string> = {
    conversation: 'var(--chart-1)',
    memory: 'var(--chart-4)',
    skills: 'var(--chart-3)',
    'system-prompt': 'var(--chart-5)',
    tools: 'var(--chart-2)',
};
