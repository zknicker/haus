import { defaultClaimDeps } from './agent-claim-actions.ts';
import { createClaimSubcommands } from './agent-claim-subcommands.ts';

export * from './agent-claim-actions.ts';
export { createClaimSubcommands };
export const CLAIM_SUBCOMMANDS = createClaimSubcommands(defaultClaimDeps);
