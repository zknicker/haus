import { boardListInputSchema, boardListSchema } from '@haus/api';
import { listBoards } from '../../boards/board-read.ts';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { boardProcedure } from './procedure.ts';

export const listBoardsProcedure = boardProcedure
    .input(boardListInputSchema)
    .output(boardListSchema)
    .query(
        async ({ ctx, input }) => await listBoards(ctx.hausDb, memberTaskActor(ctx.member), input)
    );
