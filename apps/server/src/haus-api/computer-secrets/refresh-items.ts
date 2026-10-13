import {
    computerSecretsStatusSchema,
    onePasswordIdSchema,
    onePasswordItemListSchema,
} from '@haus/api';
import { memberProcedure } from '../server/procedure.ts';
import { computerSecretsTargetSchema, relayComputerSecrets } from './relay.ts';

/** Replaces the connected vault's item list with one the desktop App just listed. No token. */
export const refreshComputerSecretItemsProcedure = memberProcedure
    .input(
        computerSecretsTargetSchema
            .extend({ items: onePasswordItemListSchema, vaultId: onePasswordIdSchema })
            .strict()
    )
    .output(computerSecretsStatusSchema)
    .mutation(({ ctx, input }) =>
        relayComputerSecrets(ctx, input, {
            items: input.items,
            kind: 'refresh-items',
            vaultId: input.vaultId,
        })
    );
