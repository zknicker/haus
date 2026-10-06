import type { ComputerAgentActivityCategory } from '../agent-activity.ts';
import {
    type ComputerToolClassification,
    isMcpName,
    knownToolCategory,
    syntheticHarnessToolActivity,
} from './activity-tool-fixtures.ts';
import { classifyShellCall } from './haus-cli-command.ts';

export interface HausHostToolRegistration {
    category: Exclude<ComputerAgentActivityCategory, 'starting_work' | 'thinking' | 'working'>;
    name: string;
    toolRef?: string;
}

export interface ComputerActivityRegistry {
    classify(input: {
        dynamic?: boolean;
        input?: unknown;
        invalid?: boolean;
        nativeName?: string;
        providerExecuted?: boolean;
        runtimeId: string;
        toolName: string;
    }): ComputerToolClassification;
    registerHausHostTool(registration: HausHostToolRegistration): void;
}

export function createComputerActivityRegistry(): ComputerActivityRegistry {
    const hostTools = new Map<string, HausHostToolRegistration>();
    return {
        classify(input) {
            const synthetic = syntheticHarnessToolActivity(
                input.toolName,
                input.providerExecuted === true
            );
            if (synthetic) {
                return synthetic === 'skip'
                    ? { outcome: 'skip' }
                    : { category: synthetic, outcome: 'activity' };
            }
            const known = knownToolCategory(input.runtimeId, input.toolName, input.nativeName);
            // A runtime builtin whose input failed its schema is still that builtin
            // (codex-acp sends a parsed file read as `exec_command` with no command).
            if (known && input.invalid && input.providerExecuted) {
                return { category: known, outcome: 'activity' };
            }
            if (input.dynamic || isMcpName(input.toolName) || isMcpName(input.nativeName)) {
                return { category: 'using_tool', outcome: 'activity' };
            }
            const host = hostTools.get(input.nativeName ?? '') ?? hostTools.get(input.toolName);
            if (host) {
                return {
                    category: host.category,
                    outcome: 'activity',
                    ...(host.toolRef ? { toolRef: host.toolRef } : {}),
                };
            }
            return classifyShellCall(known ?? 'using_tool', input.input);
        },
        registerHausHostTool(registration) {
            hostTools.set(registration.name, registration);
        },
    };
}
