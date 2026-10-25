const { AuditLog } = require('@app/Models');
const { AUDIT_ACTOR, NO, YES } = require('@app/Helpers/constants');

// Writes one row of the audit log. Call it inside the same transaction as the change it describes,
// so the change and its record are saved together or not at all.
//
//   await Audit.log(
//     { admin: req.admin, ip, userAgent },                    // who and from where (see clientInfo in Helpers/http.js)
//     'admin_user.created',                                   // what
//     { entityType: 'admin_user', entityUuid, description, before, after },
//     { transaction },
//   );
//
// before and after must only hold values that are safe to keep: never a password, hash or token.
// pick(model, ['name', 'email']) builds such an object from an allowed list.

const pick = (source, fields) => {
  const output = {};
  if (!source) return output;
  for (const field of fields) {
    if (source[field] !== undefined) output[field] = source[field];
  }
  return output;
};

const log = async ({ admin, ip, userAgent } = {}, action, details = {}, options = {}) => {
  const { entityType, entityUuid, description, before, after, clientId } = details;

  return AuditLog.create(
    {
      actorType: admin ? AUDIT_ACTOR.ADMIN : AUDIT_ACTOR.SYSTEM,
      actorId: admin ? admin.id : null,
      actorName: admin ? String(admin.name || admin.email || '').slice(0, 150) : 'System',
      actorIsMaster: admin && admin.isMaster ? YES : NO,
      clientId: clientId || null,
      action,
      entityType: entityType || null,
      entityUuid: entityUuid || null,
      description: description ? String(description).slice(0, 300) : null,
      beforeData: before || null,
      afterData: after || null,
      ipAddress: ip ? String(ip).slice(0, 64) : null,
      userAgent: userAgent ? String(userAgent).slice(0, 400) : null,
    },
    { transaction: options.transaction },
  );
};

module.exports = { log, pick };
