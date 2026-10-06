import {
    AGENT_IDEMPOTENCY_KEY_REUSED,
    agentReminderCommandSchema,
    agentReminderScheduleInputSchema,
} from '@haus/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';
import { resolveRunnerCredential } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    ReminderCommandConflictError,
    ReminderScheduleExpiredError,
} from '../reminders/reminder-model.ts';
import {
    cancelAgentReminder,
    listAgentReminders,
    readAgentReminderLog,
    scheduleAgentReminder,
    snoozeAgentReminder,
    updateAgentReminder,
} from './reminders.ts';

/** One change per update; the title and description are one label and may change together. */
const updateSchema = agentReminderCommandSchema
    .extend({
        description: z.string().min(1).nullable().optional(),
        fireAt: z.string().datetime().optional(),
        repeat: z.string().min(1).nullable().optional(),
        script: z.string().min(1).nullable().optional(),
        title: z.string().min(1).optional(),
    })
    .refine(
        (input) =>
            [input.fireAt, input.repeat, input.script, input.title ?? input.description].filter(
                (value) => value !== undefined
            ).length === 1
    );

export function registerAgentReminderRoutes(app: FastifyInstance, db: HausDatabase) {
    app.get('/api/agent/reminders/capabilities', async (request, reply) => {
        const runner = await authorizeRunner(db, request);
        if (!runner) {
            return sendError(reply, 401, 'A valid runner credential is required.');
        }
        return { supportsReminderTimezone: true };
    });
    app.post('/api/agent/reminders/schedule', async (request, reply) => {
        const runner = await authorizeRunner(db, request);
        const parsed = agentReminderScheduleInputSchema.safeParse(request.body);
        if (!runner) {
            return sendError(reply, 401, 'A valid runner credential is required.');
        }
        if (!parsed.success) {
            return sendError(reply, 400, reminderValidationMessage(parsed.error));
        }
        return await runAction(reply, () => scheduleAgentReminder(db, runner, parsed.data));
    });

    app.get('/api/agent/reminders', async (request, reply) => {
        const runner = await authorizeRunner(db, request);
        if (!runner) {
            return sendError(reply, 401, 'A valid runner credential is required.');
        }
        const query = z.object({ status: z.string().optional() }).parse(request.query);
        return await runAction(reply, () =>
            listAgentReminders(db, runner, query.status?.split(','))
        );
    });

    app.post('/api/agent/reminders/snooze', async (request, reply) => {
        const runner = await authorizeRunner(db, request);
        const parsed = agentReminderCommandSchema
            .extend({ by: z.string().min(1) })
            .safeParse(request.body);
        if (!runner) {
            return sendError(reply, 401, 'A valid runner credential is required.');
        }
        if (!parsed.success) {
            return sendError(reply, 400, reminderValidationMessage(parsed.error));
        }
        return await runAction(reply, () => snoozeAgentReminder(db, runner, parsed.data));
    });

    app.post('/api/agent/reminders/update', async (request, reply) => {
        const runner = await authorizeRunner(db, request);
        const parsed = updateSchema.safeParse(request.body);
        if (!runner) {
            return sendError(reply, 401, 'A valid runner credential is required.');
        }
        if (!parsed.success) {
            return sendError(reply, 400, reminderValidationMessage(parsed.error));
        }
        return await runAction(reply, () => updateAgentReminder(db, runner, parsed.data));
    });

    app.post('/api/agent/reminders/cancel', async (request, reply) => {
        const runner = await authorizeRunner(db, request);
        const parsed = agentReminderCommandSchema.safeParse(request.body);
        if (!runner) {
            return sendError(reply, 401, 'A valid runner credential is required.');
        }
        if (!parsed.success) {
            return sendError(reply, 400, reminderValidationMessage(parsed.error));
        }
        return await runAction(reply, () => cancelAgentReminder(db, runner, parsed.data));
    });

    app.get('/api/agent/reminders/log', async (request, reply) => {
        const runner = await authorizeRunner(db, request);
        const parsed = z
            .object({
                id: z.string().min(1).optional(),
                limit: z.coerce.number().int().min(1).max(100).default(50),
            })
            .safeParse(request.query);
        if (!runner) {
            return sendError(reply, 401, 'A valid runner credential is required.');
        }
        if (!parsed.success) {
            return sendError(reply, 400, reminderValidationMessage(parsed.error));
        }
        return await runAction(reply, () => readAgentReminderLog(db, runner, parsed.data));
    });
}

async function runAction(reply: FastifyReply, action: () => Promise<unknown>) {
    try {
        return await action();
    } catch (cause) {
        if (cause instanceof ReminderCommandConflictError) {
            return reply.code(409).send({
                code: AGENT_IDEMPOTENCY_KEY_REUSED,
                message: cause.message,
                nextAction:
                    'List reminders to reconcile the existing command. A changed schedule revision needs a new saved command id; never replace an earlier command input.',
            });
        }
        if (cause instanceof ReminderScheduleExpiredError) {
            return reply.code(409).send({
                code: 'REMINDER_FIRE_TIME_PASSED',
                message: cause.message,
                nextAction:
                    'Run haus reminder list. If no matching reminder exists, save the next agreed slot and a new command id before scheduling.',
            });
        }
        return reply.code(409).send({
            code: 'INVALID_ARG',
            message: cause instanceof Error ? cause.message : 'The reminder request failed.',
        });
    }
}

async function authorizeRunner(db: HausDatabase, request: FastifyRequest) {
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const token = typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null;
    return token ? await resolveRunnerCredential(db, token) : null;
}

function sendError(reply: FastifyReply, status: number, message: string) {
    const code = status === 401 ? 'MISSING_TOKEN' : 'INVALID_ARG';
    return reply.code(status).send({ code, message });
}

function reminderValidationMessage(error: z.ZodError) {
    return `The reminder request was invalid: ${error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.map(String).join('.') || 'request'}: ${issue.message}`)
        .join('; ')}`;
}
