import { claudeInstallTarget } from './claude-code/claude-install.ts';
import { CODEX_CLI_VERSION, codexPinManifest } from './codex/codex-executable.ts';

/**
 * Release and doctor gate: the runtime pins the drivers install from are embedded and usable on
 * this machine. Claude Code needs a pinned build for this platform; Codex needs its pinned
 * manifest naming the version it verifies. Grok Build runs the operator's installed `grok`, so
 * nothing of it ships.
 */
export function validateComputerRuntimeAssets(): void {
    claudeInstallTarget();
    const manifest: unknown = JSON.parse(codexPinManifest);
    const pinned =
        typeof manifest === 'object' &&
        manifest !== null &&
        'dependencies' in manifest &&
        typeof manifest.dependencies === 'object' &&
        manifest.dependencies !== null &&
        '@openai/codex' in manifest.dependencies
            ? manifest.dependencies['@openai/codex']
            : null;
    if (pinned !== CODEX_CLI_VERSION) {
        throw new Error(
            `The embedded Codex pin names ${String(pinned)}, not ${CODEX_CLI_VERSION}.`
        );
    }
}
