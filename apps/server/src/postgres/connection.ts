import { SQL } from 'bun';
import { type BunSQLDatabase, drizzle } from 'drizzle-orm/bun-sql';
import { describeDatabaseUrl } from './database-url.ts';
import * as schema from './schema.ts';

export type HausDatabase = BunSQLDatabase<typeof schema>;

export interface HausConnection {
    close(): Promise<void>;
    db: HausDatabase;
    health(): Promise<boolean>;
}

/** Connections each pool opens. Two pools, so the Server's ceiling is twice this. */
const poolSize = 10;

/**
 * Opens the Server's DML-only PostgreSQL connection.
 *
 * Transactions get their own pool. Bun 1.3.5's `SQL` client will hand a pooled
 * connection to a plain query while that connection is still reserved by an
 * open transaction, once transactions run long enough to queue behind one
 * another — as every durable write does here, since they serialize on the
 * Server row. The stray query then runs inside that transaction, and the
 * transaction's own `select ... for update` is orphaned on a connection the
 * pool has already handed on: the Server row lock is never released and every
 * later durable write queues behind it forever. A client that only ever runs
 * transactions has no plain queries to leak into one, so the split holds the
 * invariant Bun's pool does not.
 *
 * Remove the split once Bun isolates reserved connections, and take
 * `transaction` straight off the query pool again.
 */
export async function connectHausDatabase(databaseUrl: string): Promise<HausConnection> {
    const queryClient = new SQL({ max: poolSize, url: databaseUrl });
    const transactionClient = new SQL({ max: poolSize, url: databaseUrl });

    try {
        // Probed one at a time: a rejection nobody is awaiting yet is an
        // unhandled rejection, and an unreachable database fails both.
        await queryClient`SELECT 1`;
        await transactionClient`SELECT 1`;
    } catch (cause) {
        await Promise.allSettled([queryClient.close(), transactionClient.close()]);
        throw new Error(
            `Failed to connect to Haus PostgreSQL at ${describeDatabaseUrl(databaseUrl)}.`,
            { cause }
        );
    }

    const queries = drizzle(queryClient, { schema });
    const transactions = drizzle(transactionClient, { schema });

    return {
        close: async () => {
            await Promise.allSettled([queryClient.close(), transactionClient.close()]);
        },
        db: withIsolatedTransactions(queries, transactions),
        health: async () => {
            try {
                await queryClient`SELECT 1`;
                await transactionClient`SELECT 1`;
                return true;
            } catch {
                return false;
            }
        },
    };
}

/** One database to callers; `transaction` alone runs on the transaction pool. */
function withIsolatedTransactions(queries: HausDatabase, transactions: HausDatabase): HausDatabase {
    return new Proxy(queries, {
        get: (target, property, receiver) =>
            property === 'transaction'
                ? transactions.transaction.bind(transactions)
                : Reflect.get(target, property, receiver),
    });
}
