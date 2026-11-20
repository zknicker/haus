import type {
    ModelSignInStartInput,
    ModelSignInTargetInput,
    RunnerConnectionCredentialFrame,
    RunnerConnectionStatusFrame,
    RunnerSignInCodeFrame,
    RunnerSignInFinishedFrame,
} from '@haus/api';
import type { RunnerWire } from '../agent-delivery/loop-host.ts';
import type { HausServerApplicationOptions } from '../haus-server-options.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { modelConnectionsUpdatedTopic } from '../realtime/topics.ts';
import { type SecretsKey, SecretsKeyMissingError } from '../secrets/sealed-secret.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ModelSignInNotFoundError, RunnerNotConnectedError } from './model-connection-errors.ts';
import { ModelSignIns } from './model-sign-ins.ts';
import { requireConnectionsOwner } from './read-model-connections.ts';
import {
    readRunnerConnections,
    recordConnectionStatus,
    storeRotatedCredential,
} from './runner-connection-store.ts';
import { insertSignedInConnection } from './write-model-connections.ts';

export type RunnerConnectionFrame =
    | RunnerConnectionCredentialFrame
    | RunnerConnectionStatusFrame
    | RunnerSignInCodeFrame
    | RunnerSignInFinishedFrame;

export class ModelConnectionRelay {
    private readonly signIns = new ModelSignIns();
    private reportedMissingKey = false;

    readonly secretsKey: SecretsKey | null;

    constructor(
        private readonly db: HausDatabase,
        private readonly runner: RunnerWire,
        settings: Pick<HausServerApplicationOptions, 'secretsKey'>
    ) {
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
        for (const { serverId } of this.signIns.failInFlight(
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
        this.sweep();
        if (!this.runner.isOnline()) {
            throw new RunnerNotConnectedError();
        }
        const signIn = this.signIns.start(input.serverId, input.provider, input.label);
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
        const signIn = await this.readSignIn(member, input);
        if (!this.signIns.end(signIn.signInId, { detail: 'Cancelled.', status: 'cancelled' })) {
            return signIn;
        }
        this.runner.send({ signInId: signIn.signInId, type: 'runner-sign-in-cancel' });
        modelConnectionsUpdatedTopic.announce({ serverId: input.serverId });
        return await this.readSignIn(member, input);
    }

    async ingest(frame: RunnerConnectionFrame) {
        this.sweep();
        switch (frame.type) {
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
        try {
            const result = await storeRotatedCredential(this.db, this.secretsKey, frame);
            this.announce(result?.stored ? result.serverId : null);
        } catch (error) {
            console.error(`[haus] rotated credential for ${frame.connectionId} not stored`, error);
        }
        await this.sendSnapshot();
    }

    private async finishSignIn(frame: RunnerSignInFinishedFrame) {
        const { result, signInId } = frame;
        if (result.status !== 'connected') {
            this.announce(this.signIns.end(signInId, result));
            return;
        }
        const signIn = this.signIns.inFlight(signInId);
        if (!signIn) {
            return;
        }
        const { serverId, view } = signIn;
        try {
            const connectionId = await insertSignedInConnection(this.db, this.secretsKey, {
                credential: { credential: result.credential, kind: 'oauth' },
                label: view.label,
                provider: view.provider,
                serverId,
            });
            this.signIns.connect(signInId, connectionId);
            await this.connectionsChanged(serverId);
        } catch (error) {
            console.error(`[haus] sign-in ${signInId} could not be stored`, error);
            this.announce(
                this.signIns.end(signInId, {
                    detail: 'The Server could not store this sign-in.',
                    status: 'failed',
                })
            );
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
