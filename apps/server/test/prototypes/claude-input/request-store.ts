// Throwaway prototype: scratch PostgreSQL only, outside the production schema.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { SQL } from 'bun';
import * as z from 'zod';

const question = z.object({
    header: z.string().max(100),
    multiSelect: z.boolean(),
    options: z
        .array(z.object({ description: z.string().max(1000), label: z.string().max(200) }))
        .min(2)
        .max(4),
    question: z.string().min(1).max(2000),
});
export const registration = z.object({
    promptId: z.string().min(1).max(200),
    questions: z.array(question).min(1).max(4),
    sessionId: z.uuid(),
    toolUseId: z.string().min(1).max(200),
});
export const answerInput = z.object({
    id: z.string().min(1),
    answer: z.record(z.string(), z.string().min(1).max(4000)),
});
export const consumption = registration
    .omit({ questions: true })
    .extend({ id: z.string().min(1), answer: answerInput.shape.answer });
export type Registration = z.infer<typeof registration>;
export interface InputRequest extends Registration {
    answer: Record<string, string> | null;
    createdAt: string;
    id: string;
    resumedPromptId: string | null;
    resumedToolUseId: string | null;
    state: 'pending' | 'answered' | 'resolved' | 'cancelled';
}

export class RequestStore {
    constructor(private readonly sql: SQL) {}

    async initialize() {
        await this.sql`create table if not exists prototype_cloud_input (
            id text primary key, session_id text not null, prompt_id text not null,
            tool_use_id text not null, questions jsonb not null, answer jsonb,
            state text not null check (state in ('pending','answered','resolved','cancelled')),
            created_at timestamptz not null default now(), resumed_prompt_id text,
            resumed_tool_use_id text, unique(session_id,prompt_id,tool_use_id)
        )`;
    }

    async register(value: Registration) {
        const input = registration.parse(value);
        const id = `input_${createHash('sha256')
            .update(JSON.stringify([input.sessionId, input.promptId, input.toolUseId]))
            .digest('hex')
            .slice(0, 24)}`;
        await this.sql`insert into prototype_cloud_input
            (id,session_id,prompt_id,tool_use_id,questions,state)
            values (${id},${input.sessionId},${input.promptId},${input.toolUseId},${input.questions}::jsonb,'pending')
            on conflict do nothing`;
        const stored = await this.read(id, input.sessionId);
        if (!isDeepStrictEqual(stored.questions, input.questions)) {
            throw new Error('The same native request changed its questions.');
        }
        return stored;
    }

    async read(id: string, sessionId?: string): Promise<InputRequest> {
        const [row] = await this.sql`select id, session_id as "sessionId", prompt_id as "promptId",
            tool_use_id as "toolUseId", questions, answer, state, created_at as "createdAt",
            resumed_prompt_id as "resumedPromptId", resumed_tool_use_id as "resumedToolUseId"
            from prototype_cloud_input where id = ${id}`;
        if (!row || (sessionId && row.sessionId !== sessionId)) {
            throw new Error('Unknown request or wrong cloud session.');
        }
        return { ...row, createdAt: row.createdAt.toISOString() } as InputRequest;
    }

    async list(): Promise<InputRequest[]> {
        const rows = await this.sql`select id from prototype_cloud_input order by created_at`;
        return await Promise.all(rows.map((row: { id: string }) => this.read(row.id)));
    }

    async answer(id: string, answer: Record<string, string>) {
        const current = await this.read(id);
        const keys = current.questions.map((item) => item.question);
        if (Object.keys(answer).length !== keys.length || keys.some((key) => !answer[key])) {
            throw new Error('Answer every original question.');
        }
        await this.sql`update prototype_cloud_input set answer = ${answer}::jsonb,
            state = 'answered' where id = ${id} and state = 'pending'`;
        const stored = await this.read(id);
        if (stored.state !== 'answered' || !isDeepStrictEqual(stored.answer, answer)) {
            throw new Error('Request is stale or already has a different answer.');
        }
        return stored;
    }

    async cancel(id: string) {
        await this.sql`update prototype_cloud_input set state = 'cancelled'
            where id = ${id} and state in ('pending','answered')`;
        return await this.read(id);
    }

    async resolve(
        id: string,
        input: {
            sessionId: string;
            promptId: string;
            toolUseId: string;
            answer: Record<string, string>;
        }
    ) {
        const current = await this.read(id, input.sessionId);
        if (current.state !== 'answered' && current.state !== 'resolved') {
            throw new Error('Only an answered request can resume.');
        }
        if (!isDeepStrictEqual(current.answer, input.answer)) {
            throw new Error('Claude consumed a different answer.');
        }
        await this.sql`update prototype_cloud_input set state = 'resolved',
            resumed_prompt_id = ${input.promptId}, resumed_tool_use_id = ${input.toolUseId}
            where id = ${id} and state = 'answered'`;
        const stored = await this.read(id, input.sessionId);
        if (
            stored.state !== 'resolved' ||
            stored.resumedPromptId !== input.promptId ||
            stored.resumedToolUseId !== input.toolUseId
        ) {
            throw new Error('Stale or conflicting consumption receipt.');
        }
        return stored;
    }
}
