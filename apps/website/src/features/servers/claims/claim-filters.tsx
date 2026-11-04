import {
    ChartBarLineIcon,
    Chat01Icon,
    CheckListIcon,
    Tag01Icon,
    UserCircleIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useTaskLabels } from '../../../hooks/servers/use-task-labels.ts';
import { claimStatusLabels, claimStatusOrder } from '../../claims/claim-presentation.ts';
import { LabelDot } from '../../tasks/label-chip.tsx';
import { taskPriorityLabels, taskPriorityOrder } from '../../tasks/task-presentation.ts';
import { TaskPriorityIcon } from '../../tasks/task-priority-icon.tsx';
import { TaskStatusDisc } from '../../tasks/task-status-disc.tsx';
import { useServerContext } from '../server-context.ts';
import { type ClaimView, claimChatOptions, unassignedAssignee } from './claim-model.ts';
import { useClaimView } from './claim-view.ts';

export type ClaimFilterFieldId = 'assignee' | 'chat' | 'label' | 'priority' | 'status' | 'view';

/** Whether any dimension is still unapplied and has something to offer. */
export function hasAddableFilter(fields: ClaimFilterField[]) {
    return fields.some((field) => field.applied === null && field.options.length > 0);
}

export interface ClaimFilterOption {
    id: string;
    label: string;
    /** Glyph or colour dot shown before the option and inside the applied pill. */
    leading?: React.ReactNode;
}

export interface ClaimFilterField {
    /** The applied option, or null while this dimension narrows nothing. */
    applied: null | ClaimFilterOption;
    apply: (optionId: string) => void;
    clear: () => void;
    icon: typeof CheckListIcon;
    id: ClaimFilterFieldId;
    label: string;
    options: ClaimFilterOption[];
}

/**
 * `view` predates the field filters below and still answers one question they
 * cannot: "everything, finished work included", which is not a single status.
 * The page rests on `active`, so `All` is the option here. Its per-assignee
 * option is gone — Assignee owns that now — but the URL value still resolves
 * so existing links keep working.
 */
const viewOptions: Array<{ label: string; value: ClaimView }> = [{ label: 'All', value: 'all' }];

/**
 * The dimensions the Tasks page can be narrowed by, each carrying its own
 * options and how to apply or drop it. The add-filter menu and the applied
 * pills both read this, so the two can never disagree about what exists.
 *
 * A field with `applied: null` is simply absent from the query — that is what
 * lets the filter row stay empty until you ask for something.
 */
export function useClaimFilterFields(): ClaimFilterField[] {
    const { server } = useServerContext();
    const { filters, setAssignee, setChatId, setLabelId, setPriority, setStatus, setView } =
        useClaimView();
    const humans = useHumanDirectory(server.id);
    const chats = useChats(server.id);
    const agents = useAgents(server.id);
    const labelsQuery = useTaskLabels(server.id);

    const chatOptions = claimChatOptions(chats.data ?? [], humans).map((option) => ({
        id: option.id,
        label: option.label,
    }));
    const labelOptions = (labelsQuery.data ?? []).map((label) => ({
        id: label.id,
        label: label.name,
        leading: <LabelDot color={label.color} />,
    }));
    const statusOptions = claimStatusOrder.map((status) => ({
        id: status,
        label: claimStatusLabels[status],
        leading: <TaskStatusDisc status={status} />,
    }));
    const priorityOptions = taskPriorityOrder.map((priority) => ({
        id: priority,
        label: taskPriorityLabels[priority],
        leading: <TaskPriorityIcon priority={priority} />,
    }));
    // Agents lead: a claim is normally handed to an Agent and completed by one.
    const assigneeOptions = [
        { id: unassignedAssignee, label: 'Unassigned' },
        ...(agents.data ?? []).map((agent) => ({
            id: agent.id,
            label: agent.displayName,
            leading: <EntityAvatar name={agent.displayName} size={18} src={agent.avatarUrl} />,
        })),
    ];

    return [
        {
            applied: statusOptions.find((option) => option.id === filters.status) ?? null,
            apply: setStatus,
            clear: () => setStatus(null),
            icon: CheckListIcon,
            id: 'status',
            label: 'Status',
            options: statusOptions,
        },
        {
            applied: assigneeOptions.find((option) => option.id === filters.assignee) ?? null,
            apply: setAssignee,
            clear: () => setAssignee(null),
            icon: UserCircleIcon,
            id: 'assignee',
            label: 'Assignee',
            options: assigneeOptions,
        },
        {
            applied: priorityOptions.find((option) => option.id === filters.priority) ?? null,
            apply: setPriority,
            clear: () => setPriority(null),
            icon: ChartBarLineIcon,
            id: 'priority',
            label: 'Priority',
            options: priorityOptions,
        },
        {
            applied: labelOptions.find((option) => option.id === filters.labelId) ?? null,
            apply: setLabelId,
            clear: () => setLabelId(null),
            icon: Tag01Icon,
            id: 'label',
            label: 'Label',
            options: labelOptions,
        },
        {
            applied: chatOptions.find((option) => option.id === filters.chatId) ?? null,
            apply: setChatId,
            clear: () => setChatId(null),
            icon: Chat01Icon,
            id: 'chat',
            label: 'Chat',
            options: chatOptions,
        },
        {
            applied:
                filters.view === 'active'
                    ? null
                    : {
                          id: filters.view,
                          label:
                              viewOptions.find((option) => option.value === filters.view)?.label ??
                              filters.view,
                      },
            apply: (optionId) => setView(optionId as ClaimView),
            clear: () => setView('active'),
            icon: CheckListIcon,
            id: 'view',
            label: 'Show',
            options: viewOptions.map((option) => ({ id: option.value, label: option.label })),
        },
    ];
}
