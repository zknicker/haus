import {
    type ComputerRepoFolders,
    computerRepoFoldersInputSchema,
    computerRepoFoldersSchema,
} from '@haus/api';
import { repoFolderTrpcError } from '../../repos/repo-errors.ts';
import { readRepoFolderAccess } from '../../repos/repo-folder-access.ts';
import { readComputerRepoFolders } from '../../repos/repo-folder-read.ts';
import { memberProcedure } from '../server/procedure.ts';

export const computerRepoFoldersProcedure = memberProcedure
    .input(computerRepoFoldersInputSchema)
    .output(computerRepoFoldersSchema)
    .query(async ({ ctx, input }) => {
        try {
            const access = await readRepoFolderAccess(ctx.hausDb, ctx.member?.id ?? null, input);
            return {
                canAdd: access.canAdd,
                canRemove: access.canRemove,
                folders: await readComputerRepoFolders(ctx.hausDb, input),
            } satisfies ComputerRepoFolders;
        } catch (cause) {
            throw repoFolderTrpcError(cause);
        }
    });
