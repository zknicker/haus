import { createRouter } from '../trpc.ts';
import { connectComputerSecretsProcedure } from './connect.ts';
import { disconnectComputerSecretsProcedure } from './disconnect.ts';
import { refreshComputerSecretItemsProcedure } from './refresh-items.ts';

/** Computer settings → Secrets. Server Owner only; every operation relays to one Computer. */
export const computerSecretsRouter = createRouter({
    connect: connectComputerSecretsProcedure,
    disconnect: disconnectComputerSecretsProcedure,
    refreshItems: refreshComputerSecretItemsProcedure,
});
