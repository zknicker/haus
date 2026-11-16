import { boardMutationResultSchema, boardUpdateInputSchema } from '@haus/api';
import { updateBoard } from '../../boards/board-update.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import { boardProcedure } from './procedure.ts';

export const updateBoardProcedure = boardProcedure
    .input(boardUpdateInputSchema)
    .output(boardMutationResultSchema)
    .mutation(async ({ ctx, input }) => {
        const result = await updateBoard(ctx.hausDb, memberTaskActor(ctx.member), input);
        publishRealtime(result.event);
        return { board: result.board };
    });
