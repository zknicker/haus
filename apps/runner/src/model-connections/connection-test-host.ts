import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Provider } from '@earendil-works/pi-ai';
import type { RunnerUpFrame } from '@haus/api';
import { openDispatchLedger } from '../dispatch/ledger.ts';
import { createJournalUploads } from '../journal/journal-uploads.ts';
import { createPiHarness } from '../pi/pi-driver.ts';
import { connectionModels } from '../pi/pi-models.ts';
import type { RunnerLink } from '../run-context.ts';
import { cleanups, runnerToken, type StandInRoutes, serverStandIn } from '../runner-test-server.ts';
import { openServerLink } from '../server-link.ts';
import { createTurnHostWith } from '../turn/turn-host.ts';
import { createConnectionBook } from './connection-book.ts';
import { createCapacityReader } from './connection-capacity.ts';

export async function connectedRunner(
    provider: Provider,
    options: { dataDir?: string; usageRoutes?: StandInRoutes } = {}
) {
    const { usageRoutes } = options;
    const server = serverStandIn(usageRoutes);
    const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'haus-runner-connections-')));
    if (!options.dataDir) {
        cleanups.push(() => rm(dataDir, { force: true, recursive: true }));
    }
    const book = createConnectionBook();
    let attached: ReturnType<typeof openServerLink> | null = null;
    const link: RunnerLink = { send: (frame) => attached?.link.send(frame) };
    const capacity = usageRoutes
        ? createCapacityReader({
              book,
              link,
              log: () => undefined,
              usageUrls: {
                  chatgpt: `${server.url}/backend-api/wham/usage`,
                  claude: `${server.url}/api/oauth/usage`,
              },
          })
        : null;
    const pi = createPiHarness({
        log: () => undefined,
        maxWarm: 1,
        models: (launch) =>
            connectionModels({ book, connectionId: launch.connection.id, link, provider }),
    });
    const ledger = openDispatchLedger(dataDir);
    const journal = createJournalUploads({
        dataDir,
        environment: {},
        log: () => undefined,
        runnerToken,
    });
    const turnHost = createTurnHostWith({
        book,
        ...(capacity ? { capacity } : {}),
        dataDir,
        factory: pi.factory,
        journal,
        ledger,
        link,
        log: () => undefined,
    });
    const opened = openServerLink({
        book,
        config: { runnerToken, serverUrl: server.url },
        journal,
        ledger,
        log: () => undefined,
        reconnectDelaysMs: [0],
        turnHost,
    });
    attached = opened;
    const close = async () => {
        opened.close();
        await pi.close();
    };
    cleanups.push(close);
    await opened.ready;
    await server.frame('runner-inventory');
    return {
        book,
        close,
        dataDir,
        journal,
        server,
        unread(type: RunnerUpFrame['type']) {
            return server.received.filter((frame) => frame.type === type);
        },
    };
}
