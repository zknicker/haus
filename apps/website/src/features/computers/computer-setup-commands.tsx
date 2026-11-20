import { CodeSnippet } from '../../components/code-snippet.tsx';
import {
    buildComputerSetupCommands,
    type ComputerSetupCommands as ComputerSetupCommandValues,
} from './computer-install-command.ts';

export function ComputerSetupCommands({
    serverSlug,
    updateCommand,
}: {
    serverSlug: string;
    updateCommand: string | null;
}) {
    return (
        <ComputerSetupCommandList
            commands={buildComputerSetupCommands(serverSlug)}
            updateCommand={updateCommand}
        />
    );
}

export function ComputerSetupCommandList({
    commands,
    updateCommand,
}: {
    commands: ComputerSetupCommandValues;
    updateCommand: string | null;
}) {
    return (
        <ol className="grid min-w-0 gap-4">
            <CommandStep command={commands.install} label="Install" number={1} />
            <CommandStep command={commands.setup} label="Setup" number={2} />
            {updateCommand ? (
                <CommandStep command={updateCommand} label="Update" number={3} />
            ) : null}
        </ol>
    );
}

function CommandStep({
    command,
    label,
    number,
}: {
    command: string;
    label: string;
    number: number;
}) {
    return (
        <li className="grid min-w-0 gap-1.5">
            <p className="text-foreground font-medium">
                {number}. {label}
            </p>
            <CodeSnippet lines={command} wrap />
        </li>
    );
}
