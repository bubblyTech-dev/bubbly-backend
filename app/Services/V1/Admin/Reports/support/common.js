// Small helpers shared by the Inquiries, Announcements, User & Access, Audit and System reports.
// They live next to the framework (not inside it) so no framework file had to change.

// Escapes user text for ILIKE so "%" and "_" are searched as plain characters.
const escapeLike = (text) => String(text).replace(/[\\%_]/g, (match) => `\\${match}`);

// "%text%" ready for ILIKE ... (a replacement value, never part of the SQL text)
const contains = (text) => `%${escapeLike(text)}%`;

// "text%" for prefix searches
const startsWith = (text) => `${escapeLike(text)}%`;

// Cuts long text so one row can never become huge (an Excel cell holds at most 32,767 characters).
const truncate = (value, max) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// {"a":1} as one compact line, cut at max characters
const compactJson = (value, max = 4000) => {
  if (value === null || value === undefined) return '';
  return truncate(JSON.stringify(value), max);
};

const isMaster = (ctx) => Boolean(ctx && ctx.admin && ctx.admin.isMaster);

// Master admin accounts are hidden from everyone except a master admin (the same idea as the audit log,
// where actions of the master are visible to the master only). `typeColumn` is the admin_users.type column to test.
const staffOnly = (ctx, typeColumn) => (isMaster(ctx) ? '' : ` AND ${typeColumn} <> 1`);

const yesNo = (value) => (Number(value) === 1 ? 'Yes' : 'No');

// Hours with one decimal, or null when there is no value
const hours = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10);

const percentOf = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

// a number stored inside JSON, read as text by SQL, or NULL when it is missing or not a whole number
const jsonNumber = (path) => `CASE WHEN (${path}) ~ '^[0-9]{1,15}$' THEN (${path})::bigint END`;

module.exports = { jsonNumber, escapeLike, contains, startsWith, truncate, compactJson, isMaster, staffOnly, yesNo, hours, percentOf };
