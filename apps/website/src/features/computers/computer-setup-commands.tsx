import { CodeSnippet } from '../../components/code-snippet.tsx';
import {
    buildComputerSetupCommands,
    type ComputerSetupCommands as ComputerSetupCommandValues,
} from './computer-install-command.ts';

export function ComputerSetupCommands({ serverSlug }: { serverSlug: string }) {
    return <ComputerSetupCommandList commands={buildComputerSetupCommands(serverSlug)} />;
}

export function ComputerSetupCommandList({ commands }: { commands: ComputerSetupCommandValues }) {
    return (
        <ol className="grid min-w-0 gap-4">
            <CommandStep command={commands.install} label="Install" number={1} />
            <CommandStep command={commands.setup} label="Setup" number={2} />
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
        <li className="grid min-w-0 gap-2">
            <p className="text-sm font-medium">
                {number}. {label}
            </p>
            <CodeSnippet lines={command} />
        </li>
    );
}
