// One FIFO serializes commands from Agents sharing this connection.
export class BrowserCommandQueue {
    private tail: Promise<unknown> = Promise.resolve();

    run<T>(command: () => Promise<T>): Promise<T> {
        const result = this.tail.then(command, command);
        this.tail = result;
        return result;
    }
}
