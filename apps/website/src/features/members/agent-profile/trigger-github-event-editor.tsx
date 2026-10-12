import type { GithubTrigger } from '@haus/api';
import { Button, Form } from '@heroui/react';
import { useState } from 'react';
import { useTriggerUpdate } from '../../../hooks/members/use-trigger-update.ts';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';
import { refusalText } from './agent-trigger-model.ts';
import { TriggerGithubEvents } from './trigger-github-events.tsx';
import { githubEventDraftFromEntry, githubEventFromDraft } from './trigger-github-events-model.ts';

export function TriggerGithubEventEditor({
    trigger,
    serverId,
}: {
    trigger: GithubTrigger;
    serverId: string;
}) {
    const update = useTriggerUpdate(serverId, trigger.ownerAgentId);
    const [editing, setEditing] = useState(false);
    const [drafts, setDrafts] = useState(() =>
        trigger.github.events.map(githubEventDraftFromEntry)
    );
    const entries = drafts.map(githubEventFromDraft);
    const valid =
        entries.length > 0 && entries.length <= 10 && entries.every((entry) => entry !== null);
    if (!editing) {
        return (
            <Button
                onPress={() => {
                    setDrafts(trigger.github.events.map(githubEventDraftFromEntry));
                    setEditing(true);
                }}
                size="sm"
                variant="tertiary"
            >
                Edit filters
            </Button>
        );
    }
    return (
        <Form
            className="grid gap-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (!valid || update.isPending) {
                    return;
                }
                const { installationId, repositories } = trigger.github;
                void update
                    .update(trigger.id, {
                        github: {
                            installationId,
                            repositories,
                            events: entries.flatMap((entry) => (entry ? [entry] : [])),
                        },
                    })
                    .then(() => setEditing(false))
                    .catch(() => undefined);
            }}
        >
            <TriggerGithubEvents
                events={drafts}
                isDisabled={update.isPending}
                onChange={setDrafts}
            />
            <SettingsRowError>
                {update.error ? refusalText(update.error.message) : null}
            </SettingsRowError>
            <div className="flex gap-2">
                <Button isDisabled={!valid} isPending={update.isPending} size="sm" type="submit">
                    Save filters
                </Button>
                <Button
                    isDisabled={update.isPending}
                    onPress={() => setEditing(false)}
                    size="sm"
                    variant="secondary"
                >
                    Cancel
                </Button>
            </div>
        </Form>
    );
}
