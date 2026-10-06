import type { Agent } from '@haus/api';
import { AlertDialog, Button, Dropdown, Header, Label, Separator, Tooltip } from '@heroui/react';
import {
    ArrowReloadHorizontalIcon,
    Delete02Icon,
    MoreHorizontalIcon,
    RefreshIcon,
    SparklesIcon,
    StopCircleIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgentDelete } from '../../../hooks/members/use-agent-delete.ts';
import { useAgentReset } from '../../../hooks/members/use-agent-reset.ts';
import { useAgentRestart } from '../../../hooks/members/use-agent-restart.ts';
import { useAgentState } from '../../../hooks/members/use-agent-state.ts';
import { useAgentStop } from '../../../hooks/members/use-agent-stop.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { DeleteDialog } from '../../../routes/app/delete-dialog.tsx';
import { type AgentAction, disabledAgentActions, fullResetCopy } from './agent-actions-model.ts';

const menuIconSize = 16;

interface AgentActionsValue {
    disabledKeys: ReadonlySet<AgentAction>;
    run: (action: AgentAction) => void;
}

const AgentActionsContext = React.createContext<AgentActionsValue | null>(null);

/**
 * Every lifecycle verb an Agent has, in one overflow menu on its profile
 * header. These were four cards in a Session section plus a fifth in a Danger
 * section — a whole screen of chrome for actions nobody runs twice a week.
 * Render this only where `canRunAgentActions` allows it; the menu itself has
 * no role gate, so its queries never start for a Member.
 */
export function AgentActionsMenu({
    variant = 'secondary',
    ...props
}: AgentActionsProps & {
    /** `ghost` in the shell band, beside the band's other icon-only actions. */
    variant?: 'ghost' | 'secondary';
}) {
    return (
        <AgentActions {...props}>
            <Dropdown>
                <Tooltip>
                    <Button
                        aria-label={`${props.agent.displayName} — Agent actions`}
                        isIconOnly
                        size="sm"
                        variant={variant}
                    >
                        <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={menuIconSize} />
                    </Button>
                    <Tooltip.Content>Agent actions</Tooltip.Content>
                </Tooltip>
                <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu aria-label="Agent actions">
                        <AgentActionsSections />
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
        </AgentActions>
    );
}

interface AgentActionsProps {
    agent: Agent;
    onDeleted: () => void;
    server: ServerDetail;
}

/**
 * Owns the lifecycle mutations and their confirmation dialogs, so the verbs
 * can ride in any host's menu (`AgentActionsSections`) — the profile header's
 * own menu, or the Workspace page bar's single "…" menu. The dialogs live
 * here, outside the menu, because a menu unmounts as soon as an item runs.
 * Same role gate as the menu: render only where `canRunAgentActions` allows.
 */
export function AgentActions({
    agent,
    children,
    onDeleted,
    server,
}: AgentActionsProps & { children: React.ReactNode }) {
    const [fullResetOpen, setFullResetOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const reset = useAgentReset(server.id, agent.id);
    const restart = useAgentRestart(server.id, agent.id);
    const state = useAgentState(server.id, agent.id);
    const stop = useAgentStop(server.id, agent.id);
    const remove = useAgentDelete(server.id, () => {
        setDeleteOpen(false);
        onDeleted();
    });
    const resetCopy = fullResetCopy(agent.factoryKind);
    const disabledKeys = new Set(
        disabledAgentActions({
            isPending: remove.isPending || reset.isPending || restart.isPending || stop.isPending,
            isRunning: Boolean(state.data?.running),
        })
    );

    const run = (action: AgentAction) => {
        if (action === 'stop') {
            void stop.stop();
        } else if (action === 'restart') {
            void restart.restart();
        } else if (action === 'fresh-session') {
            reset.reset('session').catch(() => undefined);
        } else if (action === 'full-reset') {
            setFullResetOpen(true);
        } else {
            setDeleteOpen(true);
        }
    };

    return (
        <AgentActionsContext.Provider value={{ disabledKeys, run }}>
            {children}
            <AlertDialog isOpen={fullResetOpen} onOpenChange={setFullResetOpen}>
                <AlertDialog.Backdrop isDismissable>
                    <AlertDialog.Container size="sm">
                        <AlertDialog.Dialog>
                            <AlertDialog.Header>
                                <AlertDialog.Icon status="danger" />
                                <AlertDialog.Heading>Full Reset?</AlertDialog.Heading>
                            </AlertDialog.Header>
                            <AlertDialog.Body>{resetCopy.confirmation}</AlertDialog.Body>
                            <AlertDialog.Footer>
                                <Button
                                    isDisabled={reset.isPending}
                                    slot="close"
                                    type="button"
                                    variant="secondary"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    isPending={reset.isPending}
                                    onPress={() =>
                                        reset
                                            .reset('full')
                                            .then(() => setFullResetOpen(false))
                                            .catch(() => undefined)
                                    }
                                    type="button"
                                    variant="danger"
                                >
                                    Full Reset
                                </Button>
                            </AlertDialog.Footer>
                        </AlertDialog.Dialog>
                    </AlertDialog.Container>
                </AlertDialog.Backdrop>
            </AlertDialog>
            {deleteOpen ? (
                <DeleteDialog
                    confirmation={agent.displayName}
                    description="This permanently destroys the Agent’s local workspace, skills, runtime state, queues, and vault when its Computer can be reached. Its authored collaboration history remains."
                    onConfirm={() =>
                        remove.mutate({
                            agentId: agent.id,
                            confirmation: agent.displayName,
                            serverId: server.id,
                        })
                    }
                    onOpenChange={(open) => !open && setDeleteOpen(false)}
                    pending={remove.isPending}
                    title="Delete Agent"
                />
            ) : null}
        </AgentActionsContext.Provider>
    );
}

/** The lifecycle verbs as menu sections; renders nothing outside `AgentActions`. */
export function AgentActionsSections() {
    const actions = React.useContext(AgentActionsContext);
    if (!actions) {
        return null;
    }
    const item = (action: AgentAction) => ({
        id: action,
        isDisabled: actions.disabledKeys.has(action),
        onAction: () => actions.run(action),
    });
    return (
        <>
            <Dropdown.Section>
                <Header>Session</Header>
                <Dropdown.Item {...item('stop')} textValue="Stop">
                    <Icon aria-hidden="true" icon={StopCircleIcon} size={menuIconSize} />
                    <Label>Stop</Label>
                </Dropdown.Item>
                <Dropdown.Item {...item('restart')} textValue="Restart">
                    <Icon aria-hidden="true" icon={RefreshIcon} size={menuIconSize} />
                    <Label>Restart</Label>
                </Dropdown.Item>
                <Dropdown.Item {...item('fresh-session')} textValue="Start fresh session">
                    <Icon aria-hidden="true" icon={SparklesIcon} size={menuIconSize} />
                    <Label>Start fresh session</Label>
                </Dropdown.Item>
            </Dropdown.Section>
            {/* Explicit: a host menu may open from a Toolbar, whose context turns separators vertical. */}
            <Separator orientation="horizontal" />
            <Dropdown.Section>
                <Dropdown.Item {...item('full-reset')} textValue="Full reset" variant="danger">
                    <Icon aria-hidden="true" icon={ArrowReloadHorizontalIcon} size={menuIconSize} />
                    <Label>Full reset</Label>
                </Dropdown.Item>
                <Dropdown.Item {...item('delete')} textValue="Delete Agent" variant="danger">
                    <Icon aria-hidden="true" icon={Delete02Icon} size={menuIconSize} />
                    <Label>Delete Agent</Label>
                </Dropdown.Item>
            </Dropdown.Section>
        </>
    );
}
