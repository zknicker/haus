import type { ReactNode } from 'react';
import { ClarificationToolStep } from './clarification-tool-step.tsx';
import { GenericToolStep } from './generic-tool-step.tsx';
import { ShellToolStep } from './shell-tool-step.tsx';
import type { ToolStepRendererProps } from './types.ts';
import { WorkspaceChangesToolStep } from './workspace-changes-tool-step.tsx';

type ToolStepRenderer = (props: ToolStepRendererProps) => ReactNode;

// Tool-aware inline rows, resolved by tool name: exact match first, then
// substring match, then GenericToolStep. To customize a tool's row, add one
// entry here; compose ToolTimelineStep + InlineToolLabel so the row inherits
// the drawer trigger, enter animation, shimmer, and status colors. Detailed
// execution bodies live in features/turn-trace/. See
// docs/internals/tool-presentation.md.
const toolStepRenderers = {
    bash: ShellToolStep,
    clarify: ClarificationToolStep,
    command: ShellToolStep,
    exec: ShellToolStep,
    shell: ShellToolStep,
    terminal: ShellToolStep,
    workspace_changes: WorkspaceChangesToolStep,
    zsh: ShellToolStep,
} satisfies Record<string, ToolStepRenderer>;

export function ToolStep(props: ToolStepRendererProps) {
    if (props.row.clarification) {
        return <ClarificationToolStep {...props} />;
    }

    const Renderer = resolveToolStepRenderer(props.row.toolCall.name);
    return <Renderer {...props} />;
}

function resolveToolStepRenderer(name: string): ToolStepRenderer {
    const normalized = name.trim().toLowerCase();

    for (const [key, renderer] of Object.entries(toolStepRenderers)) {
        if (normalized === key || normalized.includes(key)) {
            return renderer;
        }
    }

    return GenericToolStep;
}
