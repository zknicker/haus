import { createRouter } from '../trpc.ts';

/**
 * The Linear connection's procedures (specs/linear-app.md#procedures-and-events),
 * one file per procedure. Input and result schemas are in `@haus/api`
 * `linear.ts` and `linear-issues.ts`.
 */
export const linearRouter = createRouter({});
