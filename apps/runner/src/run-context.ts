import type {
    AgentNoticeCommand,
    AgentReasoningEffort,
    AgentStartCommand,
    InvocationOutcome,
    RunnerUpFrame,
} from '@haus/api';

export interface RunAuthority {
    readonly agentId: string;
    readonly runCredential: string;
    readonly runId: string;
    readonly serverUrl: string;
}

export interface BashToolInput {
    readonly command: string;
    readonly description?: string;
    readonly timeout?: number;
}

export interface EditToolInput {
    readonly command: 'view' | 'create' | 'str_replace' | 'insert';
    readonly file_text?: string;
    readonly insert_line?: number;
    readonly new_str?: string;
    readonly old_str?: string;
    readonly path: string;
    readonly view_range?: readonly [number, number];
}

export interface ExecuteToolInput {
    readonly code: string;
}

export type ToolResultContent =
    | { readonly text: string; readonly type: 'text' }
    | { readonly data: string; readonly mimeType: string; readonly type: 'image' };

export interface ToolOutcome {
    readonly content: readonly ToolResultContent[];
    readonly invocation?: InvocationOutcome;
    readonly isError: boolean;
}

export interface RunTools {
    bash(toolCallId: string, input: BashToolInput, signal: AbortSignal): Promise<ToolOutcome>;
    edit(toolCallId: string, input: EditToolInput, signal: AbortSignal): Promise<ToolOutcome>;
    execute(toolCallId: string, input: ExecuteToolInput, signal: AbortSignal): Promise<ToolOutcome>;
    settle(): Promise<RunVisibility>;
}

export interface RunVisibility {
    readonly sendCount: number;
    readonly servedAutomationIds: readonly string[];
    readonly visibleMessages: readonly { chatId: string; id: string; sequence: number }[];
}

export interface RunnerLink {
    send(frame: RunnerUpFrame): void;
}

export interface RunStart {
    readonly authority: RunAuthority;
    readonly reasoningEffort: AgentReasoningEffort;
    readonly start: AgentStartCommand;
    readonly tools: RunTools;
}

export interface TurnHost {
    start(input: RunStart): Promise<void>;
    notice(notice: AgentNoticeCommand): Promise<void>;
    stop(agentId: string, runId: string): Promise<void>;
}
