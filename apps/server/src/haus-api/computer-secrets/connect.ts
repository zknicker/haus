import {
    computerSecretsStatusSchema,
    onePasswordAccountSchema,
    onePasswordItemListSchema,
    onePasswordServiceAccountNameSchema,
    onePasswordServiceAccountTokenSchema,
    onePasswordVaultSchema,
} from '@haus/api';
import { memberProcedure } from '../server/procedure.ts';
import { computerSecretsTargetSchema, relayComputerSecrets } from './relay.ts';

/**
 * Carries a freshly created 1Password service account token, plus the vault's
 * item names the desktop App listed, to the Computer. Server holds the token
 * only for this relay and never persists or logs it.
 */
export const connectComputerSecretsProcedure = memberProcedure
    .input(
        computerSecretsTargetSchema
            .extend({
                account: onePasswordAccountSchema,
                items: onePasswordItemListSchema,
                serviceAccountName: onePasswordServiceAccountNameSchema,
                token: onePasswordServiceAccountTokenSchema,
                vault: onePasswordVaultSchema,
            })
            .strict()
    )
    .output(computerSecretsStatusSchema)
    .mutation(({ ctx, input }) => {
        const { computerId, serverId, ...connection } = input;
        return relayComputerSecrets(
            ctx,
            { computerId, serverId },
            { ...connection, kind: 'connect' }
        );
    });
