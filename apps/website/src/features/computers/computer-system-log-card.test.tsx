import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComputerSystemLogGrid, ComputerSystemLogPagination } from './computer-system-log-card.tsx';

test('Computer System Log distinguishes loading, empty, and unavailable states', () => {
    const loading = renderToStaticMarkup(
        <ComputerSystemLogGrid rows={[]} state={{ status: 'loading' }} />
    );
    const empty = renderToStaticMarkup(
        <ComputerSystemLogGrid rows={[]} state={{ status: 'ready' }} />
    );
    const unavailable = renderToStaticMarkup(
        <ComputerSystemLogGrid
            rows={[]}
            state={{ onRetry: () => undefined, status: 'unavailable' }}
        />
    );

    expect(loading).toContain('Loading system log');
    expect(loading).not.toContain('No system events recorded yet');
    expect(empty).toContain('No system events recorded yet');
    expect(unavailable).toContain('System log unavailable');
    expect(unavailable).toContain('Try again');
    expect(unavailable).not.toContain('No system events recorded yet');
});

test('Computer System Log pagination summarizes the bounded page and disables its edges', () => {
    const firstPage = renderToStaticMarkup(
        <ComputerSystemLogPagination
            isPending={false}
            onNext={() => undefined}
            onPrevious={() => undefined}
            page={1}
            pageSize={6}
            total={14}
        />
    );
    const lastPage = renderToStaticMarkup(
        <ComputerSystemLogPagination
            isPending={false}
            onNext={() => undefined}
            onPrevious={() => undefined}
            page={3}
            pageSize={6}
            total={14}
        />
    );

    expect(firstPage).toContain('Events 1–6 of 14');
    expect(firstPage).toMatch(/data-slot="pagination-previous"[^>]*disabled/);
    expect(lastPage).toContain('Events 13–14 of 14');
    expect(lastPage).toMatch(/data-slot="pagination-next"[^>]*disabled/);
});
