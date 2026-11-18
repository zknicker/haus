import { computerSecretsStatusSchema } from '@haus/api';
import { memberProcedure } from '../server/procedure.ts';
import { computerSecretsTargetSchema, relayComputerSecrets } from './relay.ts';

/** Tells the Computer to forget the token and generated files. The service account stays. */
export const disconnectComputerSecretsProcedure = memberProcedure
    .input(computerSecretsTargetSchema)
    .output(computerSecretsStatusSchema)
    .mutation(({ ctx, input }) => relayComputerSecrets(ctx, input, { kind: 'disconnect' }));
