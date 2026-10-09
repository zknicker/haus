import { CodeBlock } from '@heroui-pro/react/code-block';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Button, type Key, Tree, TreeItem, TreeItemContent } from 'react-aria-components';
import { MicroLabel } from '../../components/micro-label.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { cn } from '../../lib/utils.ts';
import {
    buildTraceJsonNodes,
    formatTraceJsonCopy,
    readTraceJsonOpenIds,
    type TraceJsonContainer,
    type TraceJsonNode,
    truncateTraceJsonString,
} from './turn-trace-json-model.ts';

/**
 * A JSON payload as a tree on the compact code surface: a React Aria tree, so
 * arrow keys walk and open it and a screen reader hears each row's level and
 * state. Objects and arrays open two levels deep and state their size while
 * closed (`{3 keys}`, `[12]`); a long string folds to one line until its row
 * is pressed. The header copies the whole payload; each row copies its own value.
 */
export function TraceJson({ label, value }: { label: string; value: TraceJsonContainer }) {
    const nodes = React.useMemo(() => buildTraceJsonNodes(value), [value]);
    const [expandedKeys, setExpandedKeys] = React.useState<Set<Key>>(
        () => new Set(readTraceJsonOpenIds(nodes))
    );
    const [openStrings, setOpenStrings] = React.useState<ReadonlySet<string>>(() => new Set());
    const toggleString = (id: string) =>
        setOpenStrings((current) => {
            const next = new Set(current);
            if (!next.delete(id)) {
                next.add(id);
            }
            return next;
        });

    return (
        <CodeBlock className="code-block--compact min-w-0" data-trace-json>
            <CodeBlock.Header>
                <MicroLabel>{label}</MicroLabel>
                <CodeBlock.CopyButton
                    aria-label={`Copy ${label.toLowerCase()}`}
                    code={formatTraceJsonCopy(value)}
                />
            </CodeBlock.Header>
            <Tree
                aria-label={label}
                className="code-block__code max-h-[32rem] overflow-y-auto px-1.5 pb-1.5 font-mono outline-none"
                expandedKeys={expandedKeys}
                onExpandedChange={setExpandedKeys}
            >
                {nodes.map((node) => (
                    <TraceJsonRow
                        key={node.id}
                        node={node}
                        onToggleString={toggleString}
                        openStrings={openStrings}
                    />
                ))}
            </Tree>
        </CodeBlock>
    );
}

function TraceJsonRow({
    node,
    onToggleString,
    openStrings,
}: {
    node: TraceJsonNode;
    onToggleString: (id: string) => void;
    openStrings: ReadonlySet<string>;
}) {
    const isContainer = node.kind === 'array' || node.kind === 'object';
    const string =
        node.kind === 'string'
            ? openStrings.has(node.id)
                ? { hiddenChars: 0, text: node.text }
                : truncateTraceJsonString(node.text)
            : null;
    const canOpenString =
        node.kind === 'string' && truncateTraceJsonString(node.text).hiddenChars > 0;

    return (
        <TreeItem
            // The keyboard ring is the app's `:focus-visible` fallback (`global.css`).
            className={({ isHovered }) =>
                cn('cursor-default rounded-md', isHovered && 'bg-surface-tertiary')
            }
            id={node.id}
            onAction={canOpenString ? () => onToggleString(node.id) : undefined}
            textValue={`${node.label}: ${'summary' in node ? node.summary : node.text}`}
        >
            <TreeItemContent>
                {({ isExpanded }) => (
                    <div
                        className="group/json-row relative flex min-w-0 items-start gap-1 pe-0.5"
                        style={{ paddingInlineStart: `${(node.level - 1) * 1}rem` }}
                    >
                        {isContainer ? (
                            <Button
                                className="flex h-[1.5em] w-4 shrink-0 items-center justify-center text-muted outline-none"
                                slot="chevron"
                            >
                                <Icon
                                    className={cn(
                                        'size-3 transition-transform duration-150 motion-reduce:transition-none',
                                        isExpanded && 'rotate-90'
                                    )}
                                    icon={ArrowRight01Icon}
                                />
                            </Button>
                        ) : (
                            <span aria-hidden className="w-4 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            <TraceJsonKey node={node} />
                            {'summary' in node ? (
                                isExpanded ? null : (
                                    <span className="text-muted">{node.summary}</span>
                                )
                            ) : (
                                <TraceJsonScalar node={node} text={string?.text ?? node.text} />
                            )}
                            {string && string.hiddenChars > 0 ? (
                                <span className="text-muted">{` +${string.hiddenChars.toLocaleString()} chars`}</span>
                            ) : null}
                        </span>
                        <CodeBlock.CopyButton
                            aria-label={`Copy ${node.label}`}
                            // Overlaid at the row's end, so a 24px control never sets an 18px row's height.
                            className="absolute end-0 top-1/2 -translate-y-1/2 opacity-0 group-focus-within/json-row:opacity-100 group-hover/json-row:opacity-100"
                            code={formatTraceJsonCopy(node.value)}
                        />
                    </div>
                )}
            </TreeItemContent>
            {'children' in node
                ? node.children.map((child) => (
                      <TraceJsonRow
                          key={child.id}
                          node={child}
                          onToggleString={onToggleString}
                          openStrings={openStrings}
                      />
                  ))
                : null}
        </TreeItem>
    );
}

/** An object key in the constant ink; an array index muted, since position is not a name. */
function TraceJsonKey({ node }: { node: TraceJsonNode }) {
    const isIndex = /^\d+$/.test(node.label) && node.id.endsWith(`[${node.label}]`);
    return (
        <>
            <span className={isIndex ? 'text-muted' : 'text-code-constant'}>{node.label}</span>
            <span className="text-muted">: </span>
        </>
    );
}

function TraceJsonScalar({ node, text }: { node: TraceJsonNode; text: string }) {
    switch (node.kind) {
        case 'string':
            return <span className="text-code-string">{`"${text}"`}</span>;
        case 'null':
            return <span className="text-muted">null</span>;
        default:
            return <span className="text-code-constant">{text}</span>;
    }
}
