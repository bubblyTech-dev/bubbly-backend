// The announcement status as it really is RIGHT NOW. The database stores Draft / Scheduled / Published / Expired,
// but Scheduled, Published and Expired also follow the dates (the same rule as AnnouncementResource.effectiveStatus),
// so nothing has to run in the background when time passes.
//
//   Draft stays Draft; Expired stays Expired; otherwise ended -> Expired, not started yet -> Scheduled, else Published.
const EFFECTIVE_STATUS = `CASE
  WHEN a.status = 1 THEN 1
  WHEN a.status = 4 THEN 4
  WHEN a.ends_at IS NOT NULL AND a.ends_at <= NOW() THEN 4
  WHEN a.starts_at IS NOT NULL AND a.starts_at > NOW() THEN 2
  ELSE 3
END`;

// "All schools", "Selected schools (3)" or "Selected plans (2)"
const AUDIENCE = `CASE a.target_type
  WHEN 2 THEN 'Selected schools (' || (SELECT COUNT(*) FROM announcement_targets t WHERE t.announcement_id = a.id AND t.target_kind = 1) || ')'
  WHEN 3 THEN 'Selected plans (' || (SELECT COUNT(*) FROM announcement_targets t WHERE t.announcement_id = a.id AND t.target_kind = 2) || ')'
  ELSE 'All schools'
END`;

module.exports = { EFFECTIVE_STATUS, AUDIENCE };
