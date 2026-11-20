import type {
    AgentNoticeCommand,
    AgentReasoningEffort,
    AgentStartCommand,
    InvocationOutcome,
    RunnerUpFrame,
    ServerRuntimeSettingsCommand,
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

export interface ShellToolInput {
    readonly command: readonly string[];
    readonly timeout_ms?: number;
    readonly workdir?: string;
}

export interface ApplyPatchToolInput {
    readonly input: string;
}

export interface ViewImageToolInput {
    readonly path: string;
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
    applyPatch(
        toolCallId: string,
        input: ApplyPatchToolInput,
        signal: AbortSignal
    ): Promise<ToolOutcome>;
    bash(toolCallId: string, input: BashToolInput, signal: AbortSignal): Promise<ToolOutcome>;
    edit(toolCallId: string, input: EditToolInput, signal: AbortSignal): Promise<ToolOutcome>;
    execute(toolCallId: string, input: ExecuteToolInput, signal: AbortSignal): Promise<ToolOutcome>;
    settle(): Promise<RunVisibility>;
    shell(toolCallId: string, input: ShellToolInput, signal: AbortSignal): Promise<ToolOutcome>;
    viewImage(
        toolCallId: string,
        input: ViewImageToolInput,
        signal: AbortSignal
    ): Promise<ToolOutcome>;
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
    readonly modelConnectionId: string | null;
    readonly reasoningEffort: AgentReasoningEffort;
    readonly sessionResetKind: 'full' | 'session';
    readonly start: AgentStartCommand;
    readonly tools: RunTools;
}

export interface TurnHost {
    start(input: RunStart): Promise<void>;
    notice(notice: AgentNoticeCommand): Promise<void>;
    stop(agentId: string, runId: string): Promise<void>;
    resetAgent(agentId: string, reset: AgentReset): Promise<void>;
    runtimeSettings(settings: ServerRuntimeSettingsCommand): void;
}

export type AgentReset =
    | { readonly scope: 'restart' }
    | { readonly scope: 'retire' }
    | { readonly scope: 'full' | 'session'; readonly sessionGeneration: number };
