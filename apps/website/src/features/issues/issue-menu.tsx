import type { Issue } from '@haus/api';
import { Button, Dropdown, Header, Label, Separator, toast } from '@heroui/react';
import { Copy01Icon, CopyLinkIcon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { useServerContext } from '../servers/server-context.ts';
import { appLink, issueRoute } from '../servers/server-routes.ts';
import { IssueStateDisc } from './issue-glyphs.tsx';
import { isIssueState, issueStateLabels, issueStateOrder } from './issue-state.ts';
import { useIssuePatch } from './use-issue-patch.ts';

export function IssueMenu({ issue }: { issue: Issue }) {
    return (
        <Dropdown>
            <Button aria-label={`${issue.code} actions`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu aria-label={`${issue.code} actions`}>
                    <IssueMenuSections issue={issue} />
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

function IssueMenuSections({ issue }: { issue: Issue }) {
    const { server } = useServerContext();
    const patch = useIssuePatch();
    const link = appLink(issueRoute(server.slug, issue.code));
    return (
        <>
            <Dropdown.Section
                disallowEmptySelection
                onSelectionChange={(keys) => {
                    const next = keys === 'all' ? null : [...keys][0];
                    if (isIssueState(next) && next !== issue.state.id) {
                        patch(issue, { state: next });
                    }
                }}
                selectedKeys={new Set([issue.state.id])}
                selectionMode="single"
            >
                <Header>Status</Header>
                {issueStateOrder.map((state) => (
                    <Dropdown.Item id={state} key={state} textValue={issueStateLabels[state]}>
                        <IssueStateDisc state={state} />
                        <Label>{issueStateLabels[state]}</Label>
                        <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                ))}
            </Dropdown.Section>
            <Separator />
            <Dropdown.Section>
                <Dropdown.Item
                    id="copy-code"
                    onAction={() => copy(issue.code, `${issue.code} copied`)}
                    textValue="Copy code"
                >
                    <Icon aria-hidden="true" icon={Copy01Icon} size={16} />
                    <Label>Copy code</Label>
                </Dropdown.Item>
                <Dropdown.Item
                    id="copy-link"
                    onAction={() => copy(link, 'Link copied')}
                    textValue="Copy link"
                >
                    <Icon aria-hidden="true" icon={CopyLinkIcon} size={16} />
                    <Label>Copy link</Label>
                </Dropdown.Item>
            </Dropdown.Section>
        </>
    );
}

function copy(value: string, done: string) {
    writeClipboardText(value)
        .then(() => toast.success(done))
        .catch(() => toast.danger('Could not copy'));
}
