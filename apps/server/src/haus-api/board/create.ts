import { boardCreateInputSchema, boardMutationResultSchema } from '@haus/api';
import { createBoard } from '../../boards/board-create.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { boardProcedure } from './procedure.ts';

export const createBoardProcedure = boardProcedure
    .input(boardCreateInputSchema)
    .output(boardMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await createBoard(ctx.hausDb, memberTaskActor(ctx.member), input);
        publishRealtime(result.event);
        return { board: result.board };
    });
