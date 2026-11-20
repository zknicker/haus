import type {
    ModelSignInStartInput,
    ModelSignInTargetInput,
    RunnerConnectionCapacityFrame,
    RunnerConnectionCredentialFrame,
    RunnerConnectionStatusFrame,
    RunnerInventoryFrame,
    RunnerSignInCodeFrame,
    RunnerSignInFinishedFrame,
} from '@haus/api';
import type { RunnerWire } from '../agent-delivery/loop-host.ts';
import type { HausServerApplicationOptions } from '../haus-server-options.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { modelConnectionsUpdatedTopic } from '../realtime/topics.ts';
import { type SecretsKey, SecretsKeyMissingError } from '../secrets/sealed-secret.ts';
import {
    type AgentModelCatalog,
    computerModelCatalog,
} from '../server-agents/agent-model-catalog.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    ModelConnectionNotFoundError,
    ModelSignInNotFoundError,
    RunnerNotConnectedError,
} from './model-connection-errors.ts';
import { ModelSignIns } from './model-sign-ins.ts';
import { requireConnectionsOwner } from './read-model-connections.ts';
import { replaceSignedInCredential, requireSignInTarget } from './replace-model-connection.ts';
import {
    readRunnerConnections,
    recordConnectionCapacity,
    recordConnectionStatus,
    storeRotatedCredential,
} from './runner-connection-store.ts';
import { insertSignedInConnection } from './write-model-connections.ts';

export type RunnerConnectionFrame =
    | RunnerConnectionCapacityFrame
    | RunnerConnectionCredentialFrame
    | RunnerConnectionStatusFrame
    | RunnerSignInCodeFrame
    | RunnerSignInFinishedFrame;

export class ModelConnectionRelay {
    private readonly signIns = new ModelSignIns();
    private reportedMissingKey = false;

    readonly agentLoop = 'runner' as const;
    readonly catalog: AgentModelCatalog;
    readonly secretsKey: SecretsKey | null;

    constructor(
        private readonly db: HausDatabase,
        private readonly runner: RunnerWire & { readonly inventory: RunnerInventoryFrame | null },
        settings: Pick<HausServerApplicationOptions, 'secretsKey'>
    ) {
        this.catalog = { kind: 'runner', runtimes: () => runner.inventory?.runtimes ?? null };
        this.secretsKey = settings.secretsKey ?? null;
    }

    async connectionsChanged(serverId: string) {
        modelConnectionsUpdatedTopic.announce({ serverId });
        await this.sendSnapshot();
    }

    async runnerAttached() {
        this.runnerLost();
        await this.sendSnapshot();
    }

    runnerLost() {
        for (const { serverId } of this.signIns.failOnRunner(
            'The runner disconnected. Start the sign-in again.'
        )) {
            modelConnectionsUpdatedTopic.announce({ serverId });
        }
    }

    async startSignIn(member: HausUser | null, input: ModelSignInStartInput) {
        await requireConnectionsOwner(this.db, member, input.serverId);
        if (!this.secretsKey) {
            throw new SecretsKeyMissingError();
        }
        const replaceConnectionId = input.replaceConnectionId ?? null;
        if (replaceConnectionId) {
            await requireSignInTarget(this.db, {
                connectionId: replaceConnectionId,
                provider: input.provider,
                serverId: input.serverId,
            });
        }
        this.sweep();
        if (!this.runner.isOnline()) {
            throw new RunnerNotConnectedError();
        }
        const signIn = this.signIns.start(
            input.serverId,
            input.provider,
            input.label,
            replaceConnectionId
        );
        const sent = this.runner.send({
            provider: input.provider,
            serverId: input.serverId,
            signInId: signIn.signInId,
            type: 'runner-sign-in-start',
        });
        if (!sent) {
            this.signIns.end(signIn.signInId, {
                detail: 'The runner disconnected.',
                status: 'failed',
            });
            throw new RunnerNotConnectedError();
        }
        modelConnectionsUpdatedTopic.announce({ serverId: input.serverId });
        return signIn;
    }

    async readSignIn(member: HausUser | null, input: ModelSignInTargetInput) {
        await requireConnectionsOwner(this.db, member, input.serverId);
        this.sweep();
        const signIn = this.signIns.read(input.serverId, input.signInId);
        if (!signIn) {
            throw new ModelSignInNotFoundError();
        }
        return signIn;
    }

    async cancelSignIn(member: HausUser | null, input: ModelSignInTargetInput) {
        await requireConnectionsOwner(this.db, member, input.serverId);
        this.sweep();
        const cancel = this.signIns.cancel(input.serverId, input.signInId);
        if (!cancel) {
            throw new ModelSignInNotFoundError();
        }
        if (cancel.changed) {
            this.runner.send({ signInId: input.signInId, type: 'runner-sign-in-cancel' });
            modelConnectionsUpdatedTopic.announce({ serverId: input.serverId });
        }
        return cancel.result;
    }

    async ingest(frame: RunnerConnectionFrame) {
        this.sweep();
        switch (frame.type) {
            case 'runner-connection-capacity':
                this.announce(await recordConnectionCapacity(this.db, frame));
                return;
            case 'runner-connection-credential':
                await this.storeCredential(frame);
                return;
            case 'runner-connection-status':
                this.announce(await recordConnectionStatus(this.db, frame));
                return;
            case 'runner-sign-in-code':
                this.announce(this.signIns.showCode(frame));
                return;
            case 'runner-sign-in-finished':
                await this.finishSignIn(frame);
        }
    }

    async sendSnapshot() {
        if (!this.runner.isOnline()) {
            return;
        }
        if (!this.secretsKey) {
            if (!this.reportedMissingKey) {
                this.reportedMissingKey = true;
                console.warn('[haus] no HAUS_SECRETS_KEY: the runner gets no model connections');
            }
            this.runner.send({ connections: [], type: 'runner-model-connections' });
            return;
        }
        const connections = await readRunnerConnections(this.db, this.secretsKey);
        this.runner.send({ connections, type: 'runner-model-connections' });
    }

    private async storeCredential(frame: RunnerConnectionCredentialFrame) {
        const ack = { connectionId: frame.connectionId, rotationId: frame.rotationId };
        let stored: Awaited<ReturnType<typeof storeRotatedCredential>>;
        try {
            stored = await storeRotatedCredential(this.db, this.secretsKey, frame);
        } catch (error) {
            console.error(`[haus] rotated credential for ${frame.connectionId} not stored`, error);
            this.runner.send({
                ...ack,
                credentialVersion: frame.baseVersion,
                result: 'failed',
                type: 'runner-connection-credential-ack',
            });
            return;
        }
        this.runner.send({
            ...ack,
            credentialVersion: stored.credentialVersion,
            result: stored.result,
            type: 'runner-connection-credential-ack',
        });
        this.announce(stored.result === 'stored' ? stored.serverId : null);
        await this.sendSnapshot();
    }

    private async finishSignIn(frame: RunnerSignInFinishedFrame) {
        const { result, signInId } = frame;
        if (result.status !== 'connected') {
            this.announce(this.signIns.end(signInId, result));
            return;
        }
        const storing = this.signIns.beginStoring(signInId);
        if (!storing) {
            return;
        }
        const { replaceConnectionId, serverId, view } = storing;
        modelConnectionsUpdatedTopic.announce({ serverId });
        const credential = { credential: result.credential, kind: 'oauth' as const };
        try {
            let connectionId = replaceConnectionId;
            if (connectionId) {
                await replaceSignedInCredential(this.db, this.secretsKey, {
                    connectionId,
                    credential,
                    provider: view.provider,
                    serverId,
                });
            } else {
                connectionId = await insertSignedInConnection(this.db, this.secretsKey, {
                    credential,
                    label: view.label,
                    provider: view.provider,
                    serverId,
                });
            }
            this.signIns.settle(signInId, { connectionId });
            await this.connectionsChanged(serverId);
        } catch (error) {
            console.error(`[haus] sign-in ${signInId} could not be stored`, error);
            this.signIns.settle(signInId, {
                detail:
                    error instanceof ModelConnectionNotFoundError
                        ? 'The connection was removed during sign-in.'
                        : 'The Server could not store this sign-in.',
            });
            modelConnectionsUpdatedTopic.announce({ serverId });
        }
    }

    private sweep() {
        for (const { serverId, signInId } of this.signIns.sweep()) {
            this.runner.send({ signInId, type: 'runner-sign-in-cancel' });
            modelConnectionsUpdatedTopic.announce({ serverId });
        }
    }

    private announce(serverId: string | null) {
        if (serverId) {
            modelConnectionsUpdatedTopic.announce({ serverId });
        }
    }
}
