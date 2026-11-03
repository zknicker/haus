import { runAgentCli } from './agent-cli.ts';
import { validateMcpExecutor } from './mcp-executor-release.ts';
import { validateComputerRuntimeAssets } from './runtime/runtime-assets.ts';

export async function runInternalCommand(args: string[]): Promise<boolean> {
    switch (args[0]) {
        case '__mcp-executor':
            await (await import('@haus/mcp-executor/worker')).runMcpExecutorWorker();
            return true;
        case '__agent':
            process.exitCode = await runAgentCli(args.slice(1));
            return true;
        case '__release-check':
            validateComputerRuntimeAssets();
            await validateMcpExecutor();
            console.log('Haus Computer release assets are ready.');
            return true;
        default:
            return false;
    }
}
