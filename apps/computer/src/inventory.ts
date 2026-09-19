import type { ComputerInventory } from '@haus/api';
import { type ComputerRuntimeId, computerRuntimeCatalog } from '@haus/api/computer-runtime';
import { detectCloudAgentProviders } from './cloud-agents/registry.ts';
import { resolveRuntimeById } from './runtime-discovery.ts';

type ComputerRuntime = ComputerInventory['runtimes'][number];

/**
 * Runtimes Haus Computer knows how to drive, keyed by the CLI that must be
 * on PATH. Only installed runtimes are reported, and the report carries no
 * provider credentials — model availability, never secrets.
 */
const knownRuntimes: ComputerRuntime[] = [
    // The App offers the first model of a runtime as its default, so a new
    // model joins the end until someone decides it should lead.
    supportedRuntime('codex', [
        { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
        { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
        { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
        { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    ]),
    supportedRuntime('claude-code', [
        { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
    ]),
    supportedRuntime('pi', [{ id: 'pi', label: 'Pi' }]),
    supportedRuntime('grok-build', [
        { id: 'grok-4.6', label: 'Grok 4.6' },
        { id: 'grok-4.5', label: 'Grok 4.5' },
    ]),
];

/**
 * Reports the sanitized runtime/model inventory, plus Cloud Agent provider
 * readiness. Cloud Agent access is its own Computer capability, separate from
 * the runtime harnesses even when a provider shares a vendor with one.
 */
export async function detectFullInventory(
    options: { searchPath?: string } = {}
): Promise<ComputerInventory> {
    return {
        ...detectInventory(options),
        cloudAgentProviders: await detectCloudAgentProviders(),
    };
}

/**
 * Reports the sanitized runtime/model inventory. `HAUS_COMPUTER_INVENTORY`
 * overrides detection with an explicit JSON catalogue for development and tests;
 * otherwise only runtimes whose CLI is installed are reported.
 */
export function detectInventory(options: { searchPath?: string } = {}): ComputerInventory {
    const override = process.env.HAUS_COMPUTER_INVENTORY;
    if (override) {
        return JSON.parse(override) as ComputerInventory;
    }
    const runtimes = knownRuntimes.filter(
        (runtime) => resolveRuntimeById(runtime.id, options) !== null
    );
    return { runtimes };
}

function supportedRuntime(
    id: ComputerRuntimeId,
    models: ComputerRuntime['models']
): ComputerRuntime {
    const runtime = computerRuntimeCatalog.find((candidate) => candidate.id === id);
    if (!runtime) {
        throw new Error(`Missing supported Computer runtime ${id}.`);
    }
    return { ...runtime, models };
}
