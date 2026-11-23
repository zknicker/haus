import { computerRepoFolderStatesSchema, computerRepoFoldersInputSchema } from '@haus/api';
import { readRepoFolderStates } from '../../repos/manage-repo-folders.ts';
import { repoFolderTrpcError } from '../../repos/repo-errors.ts';
import { readRepoFolderAccess } from '../../repos/repo-folder-access.ts';
import { memberProcedure } from '../server/procedure.ts';

export const computerRepoFolderStatesProcedure = memberProcedure
    .input(computerRepoFoldersInputSchema)
    .output(computerRepoFolderStatesSchema)
    .query(async ({ ctx, input }) => {
        try {
            const access = await readRepoFolderAccess(ctx.hausDb, ctx.member?.id ?? null, input);
            return await readRepoFolderStates(ctx.hausDb, ctx.computerConnections, access);
        } catch (cause) {
            throw repoFolderTrpcError(cause);
        }
    });
