import { createRouter } from '../trpc.ts';
import { createBoardProcedure } from './create.ts';
import { listBoardsProcedure } from './list.ts';
import { onBoardUpdatedProcedure } from './on-updated.ts';
import { setBoardColumnsProcedure } from './set-columns.ts';
import { updateBoardProcedure } from './update.ts';

export const boardRouter = createRouter({
    create: createBoardProcedure,
    list: listBoardsProcedure,
    onUpdated: onBoardUpdatedProcedure,
    setColumns: setBoardColumnsProcedure,
    update: updateBoardProcedure,
});
