export function starterAgentRules(agentName: string) {
    return `# ${agentName} rules\n`;
}

export function starterWorkerRules(agentName: string) {
    return `# Rules for ${agentName}'s Workers\n`;
}

export const starterHausRules =
    '# Haus rules\n\nThese rules apply to every Captain and Worker on this Server.\n';
