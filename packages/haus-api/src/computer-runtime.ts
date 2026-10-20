/** Runtimes the first-party Computer knows how to discover and run. */
export const computerRuntimeCatalog = [
    { id: 'codex', label: 'Codex' },
    { id: 'claude-code', label: 'Claude Code' },
    { id: 'grok-build', label: 'Grok Build' },
] as const;

export type ComputerRuntimeId = (typeof computerRuntimeCatalog)[number]['id'];
