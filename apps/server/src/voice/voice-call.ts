import { randomUUID } from 'node:crypto';
import type { VoiceServerEvent } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Data, Deferred, Effect, Exit, Schedule, Scope } from 'effect';
import { WebSocket } from 'ws';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import type { HausUser } from '../users/haus-user.ts';
import { liveEventSchema } from './live-events.ts';
import { createVoiceAgentBridge } from './voice-agent-bridge.ts';
import { readVoiceAudioCommand } from './voice-audio-command.ts';
import { type VoiceChatScope, type VoiceTarget, voiceInstructions } from './voice-context.ts';
import { liveHistory, voiceTextChunks } from './voice-text.ts';

export interface VoiceCallOptions {
    apiKey: string;
    /** Test boundary for OpenAI's external WebSocket. */
    connectLive?: () => WebSocket;
    db: HausDatabase;
    delivery: AgentDelivery;
    member: HausUser;
    postCommitWork: ServerPostCommitWork;
    runtime: EffectRuntime<never>;
    scope: VoiceChatScope;
    target: VoiceTarget;
}

export async function startVoiceCall(client: WebSocket, options: VoiceCallOptions) {
    const { target } = options;
    if (client.readyState !== WebSocket.OPEN) {
        return;
    }
    let ready = false;
    let closing = false;
    let ended = false;
    let lastClientFrame = Date.now();
    const send = (event: VoiceServerEvent) => {
        if (client.readyState === WebSocket.OPEN) {
            if (client.bufferedAmount > 256_000) {
                end('The audio connection fell behind. Try calling again.');
                return;
            }
            client.send(JSON.stringify(event));
        }
    };
    const append = (
        type: 'session.thinking.append' | 'session.commentary.append',
        content: string,
        id: string | null = null
    ) => {
        if (upstream.readyState !== WebSocket.OPEN || closing || ended) {
            return;
        }
        for (const chunk of voiceTextChunks(content)) {
            upstream.send(
                JSON.stringify({ type, event_id: randomUUID(), delegation_id: id, content: chunk })
            );
        }
    };
    const bridge = await createVoiceAgentBridge(options, append, () => !(ended || closing));
    if (client.readyState !== WebSocket.OPEN) {
        return;
    }
    const scope = await settle(options.runtime, Scope.make());
    const completed = await settle(options.runtime, Deferred.make<void>());
    if (client.readyState !== WebSocket.OPEN) {
        await settle(options.runtime, Scope.close(scope, Exit.succeed(undefined)));
        return;
    }
    const upstream =
        options.connectLive?.() ??
        new WebSocket('wss://api.openai.com/v1/live/sessions', {
            headers: { Authorization: `Bearer ${options.apiKey}` },
            handshakeTimeout: 15_000,
            maxPayload: 2 * 1024 * 1024,
        });
    const end = (message?: string) => {
        if (ended) {
            return;
        }
        ended = true;
        clearTimeout(startupDeadline);
        clearTimeout(callDeadline);
        clearTimeout(closeDeadline);
        if (message && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'error', message }));
        }
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'closed' }));
            client.close();
        }
        upstream.terminate();
        void settle(options.runtime, Deferred.succeed(completed, undefined));
    };
    const startupDeadline = setTimeout(
        () => end('The voice service did not connect. Try again.'),
        20_000
    );
    const callDeadline = setTimeout(
        () => end('This preview call reached its ten-minute limit.'),
        10 * 60_000
    );
    let closeDeadline: ReturnType<typeof setTimeout> | undefined;
    const poll = Effect.suspend(() => {
        if (Date.now() - lastClientFrame > 30_000) {
            end('The call lost its audio connection.');
            return Effect.void;
        }
        if (!ready || closing || ended) {
            return Effect.void;
        }
        return Effect.tryPromise({
            try: () => bridge.synchronize(),
            catch: () => new VoiceSynchronizationError(),
        }).pipe(
            Effect.catchTag('VoiceSynchronizationError', () =>
                Effect.sync(() => end('Haus could not synchronize the Agent. Please reconnect.'))
            ),
            Effect.uninterruptible
        );
    }).pipe(Effect.repeat(Schedule.fixed('1 second')), Effect.asVoid);

    upstream.on('open', () => {
        if (ended) {
            upstream.terminate();
            return;
        }
        upstream.send(
            JSON.stringify({
                type: 'session.start',
                session: {
                    model: 'gpt-live-1',
                    instructions: voiceInstructions(target),
                    store: false,
                    audio: {
                        format: { type: 'audio/pcm', rate: 24_000 },
                        output: { voice: 'vesper' },
                    },
                    delegation: { type: 'client' },
                    input: liveHistory(bridge.history),
                },
            })
        );
    });
    upstream.on('message', (raw) => {
        if (ended) {
            return;
        }
        try {
            const parsed = liveEventSchema.safeParse(JSON.parse(raw.toString()));
            if (!parsed.success) {
                return;
            }
            const event = parsed.data;
            switch (event.type) {
                case 'session.started':
                    ready = true;
                    clearTimeout(startupDeadline);
                    append('session.thinking.append', bridge.initialActivity);
                    send({ type: 'ready', agentName: target.name, model: 'gpt-live-1' });
                    break;
                case 'session.output_audio.delta':
                    send({ type: 'audio', audio: event.delta });
                    break;
                case 'session.input_transcript.delta':
                    bridge.delegations.append(event.delta, Date.now());
                    send({ type: 'transcript', speaker: 'user', text: event.delta });
                    break;
                case 'session.output_transcript.delta':
                    send({ type: 'transcript', speaker: 'assistant', text: event.delta });
                    break;
                case 'session.delegation.created':
                    bridge.delegations.request(event.delegation.id);
                    break;
                case 'session.closed':
                    end();
                    break;
                case 'error':
                    if (!closing) {
                        end(
                            ready
                                ? 'The voice service rejected an update. Please call again.'
                                : 'The OpenAI voice service rejected the call. Check GPT-Live access and billing.'
                        );
                    }
                    break;
                default: {
                    const exhaustive: never = event;
                    return exhaustive;
                }
            }
        } catch {
            end('The voice service returned an unreadable event.');
        }
    });
    upstream.on('error', () =>
        end('The OpenAI voice service is unavailable. Check GPT-Live access and try again.')
    );
    upstream.on('close', () => end());
    client.on('message', (raw, binary) => {
        if (ended || closing) {
            return;
        }
        try {
            const command = readVoiceAudioCommand(raw.toString(), binary);
            lastClientFrame = Date.now();
            if (command.type === 'session.close') {
                closing = true;
                if (!ready) {
                    end();
                    return;
                }
                upstream.send(JSON.stringify(command));
                closeDeadline = setTimeout(() => end(), 5000);
                return;
            }
            if (!ready || upstream.readyState !== WebSocket.OPEN) {
                return;
            }
            if (upstream.bufferedAmount > 256_000) {
                end('The audio connection fell behind. Try again.');
                return;
            }
            upstream.send(JSON.stringify(command));
        } catch {
            end('The phone sent an invalid audio event.');
        }
    });
    client.on('close', () => end());
    client.on('ping', () => {
        lastClientFrame = Date.now();
    });
    client.on('error', () => end());
    await settle(options.runtime, Effect.forkIn(poll, scope));
    try {
        await settle(options.runtime, Deferred.await(completed));
    } finally {
        await settle(options.runtime, Scope.close(scope, Exit.succeed(undefined)));
    }
}

class VoiceSynchronizationError extends Data.TaggedError('VoiceSynchronizationError') {}
