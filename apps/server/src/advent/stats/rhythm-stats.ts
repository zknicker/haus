import { sql } from 'drizzle-orm';
import type { AdventScope } from '../year-scope.ts';
import type { MessageColumns } from './message-columns.ts';

type RhythmFact =
    | 'busiest-day'
    | 'busiest-hour'
    | 'early-bird'
    | 'longest-streak'
    | 'messages-sent'
    | 'night-owl'
    | 'quiet-month'
    | 'weekends-off';

/**
 * When the member wrote: counts, hours, days and months of their own messages,
 * bucketed in the scope zone. Each column reads the pass's `mine` CTE and
 * yields the fact's stat as JSON, or null when the fact is empty.
 */
export const rhythmColumns: MessageColumns<RhythmFact> = {
    'messages-sent': () => sql`(
        select json_build_object('count', count(*)::int) from mine having count(*) > 0
    )`,
    'busiest-hour': () => sql`(
        select json_build_object('hour', hour, 'count', count)
        from (
            select extract(hour from local_at)::int as hour, count(*)::int as count
            from mine
            group by 1
            order by count desc, hour asc
            limit 1
        ) top
    )`,
    // The median of each morning's first send, counting only 4am to noon local
    // so a late night never reads as an early start.
    'early-bird': () => sql`(
        select json_build_object(
            'minuteOfDay',
            (extract(epoch from percentile_disc(0.5) within group (order by first_at)) / 60)::int,
            'mornings',
            count(*)::int
        )
        from (
            select min(local_at::time) as first_at
            from mine
            where local_at::time >= time '04:00' and local_at::time < time '12:00'
            group by local_at::date
        ) mornings
        having count(*) > 0
    )`,
    'night-owl': () => sql`(
        select json_build_object('count', count(*)::int)
        from mine
        where extract(hour from local_at) < 5
        having count(*) > 0
    )`,
    'busiest-day': () => sql`(
        select json_build_object('date', date, 'count', count)
        from (
            select to_char(local_at::date, 'YYYY-MM-DD') as date, count(*)::int as count
            from mine
            group by local_at::date
            order by count desc, date asc
            limit 1
        ) top
    )`,
    // The quietest finished month between the first and last active months;
    // the month in progress is left out, or December would always win.
    'quiet-month': (scope: AdventScope) => sql`(
        with months as (
            select extract(month from local_at)::int as month, count(*)::int as count
            from mine
            group by 1
        ),
        span as (
            select
                min(month) as first_month,
                least(
                    max(month),
                    case
                        when extract(year from now() at time zone ${scope.timeZone}::text)::int
                            = ${scope.year}::int
                            then extract(month from now() at time zone ${scope.timeZone}::text)::int - 1
                        else 12
                    end
                ) as last_month
            from months
            having count(*) > 0
        )
        select json_build_object('month', candidate.month, 'count', coalesce(months.count, 0))
        from span
        cross join generate_series(span.first_month, span.last_month) as candidate(month)
        left join months on months.month = candidate.month
        where span.last_month > span.first_month
        order by coalesce(months.count, 0) asc, candidate.month asc
        limit 1
    )`,
    'weekends-off': () => sql`(
        select json_build_object(
            'weekend', weekend,
            'total', total,
            'percent', round(100.0 * weekend / total)::int
        )
        from (
            select
                (count(*) filter (where extract(isodow from local_at) >= 6))::int as weekend,
                count(*)::int as total
            from mine
        ) share
        where total > 0
    )`,
    // Gaps and islands: a day minus its rank is constant within a run of
    // consecutive days. Ties go to the earliest run.
    'longest-streak': () => sql`(
        select json_build_object('days', days, 'endedOn', ended_on)
        from (
            select count(*)::int as days, to_char(max(day), 'YYYY-MM-DD') as ended_on, run_key
            from (
                select day, day - (row_number() over (order by day))::int as run_key
                from (select distinct local_at::date as day from mine) active
            ) runs
            group by run_key
            order by days desc, run_key asc
            limit 1
        ) top
    )`,
};
