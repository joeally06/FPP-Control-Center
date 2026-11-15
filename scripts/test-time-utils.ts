import { parseDbTimestamp, toDbSqlString, formatDateTime, isRecent } from '../lib/time-utils';

(async () => {
  try {
    const sqlTs = '2025-11-14 20:00:00';
    const isoTs = '2025-11-14T20:00:00Z';

    const dtSql = parseDbTimestamp(sqlTs);
    const dtIso = parseDbTimestamp(isoTs);

    if (!dtSql || !dtIso) {
      console.error('[test-time-utils] ❌ parseDbTimestamp failed on inputs');
      process.exit(2);
    }

    const sqlToSql = toDbSqlString(dtSql);
    const isoToSql = toDbSqlString(dtIso);

    console.log('[test-time-utils] sqlToSql:', sqlToSql);
    console.log('[test-time-utils] isoToSql:', isoToSql);

    // They should be equal representation of the same UTC time
    if (sqlToSql !== isoToSql) {
      console.error('[test-time-utils] ❌ SQL -> SQL mismatch', sqlToSql, isoToSql);
      process.exit(3);
    }

    // formatDateTime should produce a human readable string
    const fmt = formatDateTime(sqlTs, 'medium');
    console.log('[test-time-utils] formatted:', fmt);

    // isRecent should return false for past date
    // (relative to now: a fixed date stops being within a year as the calendar moves on)
    const monthAgo = toDbSqlString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const recent = isRecent(monthAgo, 60 * 24 * 365); // 30 days ago, 1 year window -> true
    if (isRecent(monthAgo, 60 * 24 * 7)) {
      console.error('[test-time-utils] ❌ isRecent true for 30 days ago with a 7 day window');
      process.exit(5);
    }
    if (!recent) {
      console.error('[test-time-utils] ❌ isRecent false for 1 year boundary');
      process.exit(4);
    }

    console.log('[test-time-utils] ✅ All time utils validated');
    process.exit(0);
  } catch (err) {
    console.error('[test-time-utils] Error:', err);
    process.exit(1);
  }
})();
