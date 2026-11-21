/** The Computer's local copy of the narrow Server activity frame vocabulary. */
export type ComputerAgentActivityCategory =
    | 'browsing'
    | 'checking_messages'
    | 'delegating'
    | 'editing_files'
    | 'reading_files'
    | 'running_command'
    | 'searching_web'
    | 'sending_message'
    | 'starting_work'
    | 'thinking'
    | 'updating_instructions'
    | 'using_tool'
    | 'working';

export type ComputerAgentActivityPhase = 'completed' | 'failed' | 'interrupted' | 'started';

export interface ComputerAgentActivityUpdate {
    category: ComputerAgentActivityCategory;
    occurredAt: string;
    /** Opaque hex id pairing a `delegating` start with its settlement. */
    operationId?: string;
    phase: ComputerAgentActivityPhase;
    /** Only a canonical Haus-owned identity may cross the Computer boundary. */
    toolRef?: string;
}
