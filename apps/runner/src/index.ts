#!/usr/bin/env bun
import { parseRunnerConfig, type RunnerConfig } from './config.ts';
import { type DispatchLedger, openDispatchLedger } from './dispatch/ledger.ts';
import type { RunnerLink } from './run-context.ts';
import { openServerLink } from './server-link.ts';
import { createTurnHost } from './turn/turn-host.ts';

const pruneIntervalMs = 60 * 60 * 1000;
let attached: ReturnType<typeof openServerLink> | null = null;

if (process.argv[2] === '__mcp-executor') {
    await (await import('@haus/mcp-executor/worker')).runMcpExecutorWorker();
} else {
    const config = parseRunnerConfig(process.env);
    const ledger = openDispatchLedger(config.dataDir);
    const link: RunnerLink = { send: (frame) => attached?.link.send(frame) };
    const turnHost = createTurnHost({ config, ledger, link });
    const shutdown = (signal: NodeJS.Signals) => {
        process.stderr.write(
            `Runner received ${signal}; closing warm sessions and the Server link.\n`
        );
        attached?.close();
        turnHost.close();
        process.exit(0);
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    await startRunner({ config, ledger, turnHost });
}

async function startRunner(input: {
    config: RunnerConfig;
    ledger: DispatchLedger;
    turnHost: ReturnType<typeof createTurnHost>;
}) {
    const { config, ledger, turnHost } = input;
    await turnHost.recover(await ledger.recover());
    await ledger.prune();
    setInterval(() => void ledger.prune(), pruneIntervalMs).unref();
    const link = openServerLink({ config, ledger, turnHost });
    attached = link;
    process.stderr.write(`Runner connecting to ${config.serverUrl}.\n`);
    await link.ready;
    process.stderr.write('Runner attached to the Server.\n');
}
