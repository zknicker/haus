import type { LinearIdentity } from '@haus/api';
import { Dropdown, Label, Link } from '@heroui/react';
import { ArrowDown01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment, useEffect, useRef } from 'react';
import { Icon } from '../../../../../components/ui/icon.tsx';
import {
    type LinearIdentityAction,
    type LinearIdentityMenuAction,
    type LinearIdentityStep,
    type LinearMemberTeam,
    linearIdentityRow,
} from './linear-identity-model.ts';

const stepLabels: Record<LinearIdentityStep, string> = {
    continue: 'Finish setup',
    give: 'Give own identity',
    reinstall: 'Install again',
};

const menuLabels: Record<LinearIdentityMenuAction, string> = {
    'change-teams': 'Change teams in Linear',
    remove: 'Remove identity',
    'rotate-secret': 'Replace webhook secret',
};

/**
 * A granted Agent's identity line, as its Agent access row's description:
 * how it posts, then the next step as an inline link ("Posts via Haus · Give
 * own identity"). An installed identity's handle opens its menu. Controls sit
 * on the fact they change, so the row's trailing side is the switch alone.
 * Just after its identity installs, the line scrolls into view and takes the
 * success ink for a moment. `setupOpen` drops the step while the setup it
 * opens is showing. `memberTeams` are the Haus app's member teams, which
 * the line names when the identity is not yet a member of them.
 */
export function LinearIdentityLine({
    agentName,
    arrived,
    canManage,
    identity,
    memberTeams,
    onAction,
    setupOpen,
}: {
    agentName: string;
    arrived: boolean;
    canManage: boolean;
    identity: LinearIdentity | null;
    memberTeams: readonly LinearMemberTeam[];
    onAction: (action: LinearIdentityAction) => void;
    setupOpen: boolean;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (arrived) {
            ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [arrived]);
    const { details, fact, menu, step } = linearIdentityRow(identity, memberTeams);
    const showStep = canManage && step !== null && !setupOpen;

    return (
        <span
            className={arrived ? 'text-success transition-colors' : 'transition-colors'}
            ref={ref}
        >
            {canManage && menu.length > 0 ? (
                <FactMenu agentName={agentName} fact={fact} menu={menu} onAction={onAction} />
            ) : (
                fact
            )}
            {details.map((detail) => (
                <Fragment key={detail}> · {detail}</Fragment>
            ))}
            {showStep ? (
                <>
                    {' · '}
                    <Link onPress={() => onAction(step)}>{stepLabels[step]}</Link>
                </>
            ) : null}
        </span>
    );
}

function FactMenu({
    agentName,
    fact,
    menu,
    onAction,
}: {
    agentName: string;
    fact: string;
    menu: readonly LinearIdentityMenuAction[];
    onAction: (action: LinearIdentityAction) => void;
}) {
    return (
        <Dropdown>
            <Link aria-label={`${fact}: Linear identity actions for ${agentName}`}>
                {fact}
                <Link.Icon>
                    <Icon aria-hidden="true" icon={ArrowDown01Icon} size={12} />
                </Link.Icon>
            </Link>
            <Dropdown.Popover placement="bottom start">
                <Dropdown.Menu>
                    {menu.map((action) => (
                        <Dropdown.Item
                            id={action}
                            key={action}
                            onAction={() => onAction(action)}
                            textValue={menuLabels[action]}
                            variant={action === 'remove' ? 'danger' : undefined}
                        >
                            <Label>{menuLabels[action]}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
