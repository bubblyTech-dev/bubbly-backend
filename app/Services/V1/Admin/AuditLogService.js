const { Op } = require('sequelize');
const { paginationParams } = require('@app/Helpers/pagination');
const { NO } = require('@app/Helpers/constants');
const { AuditLog } = require('@app/Models');
const AuditLogResource = require('@app/Resources/V1/Admin/AuditLogResource');

const escapeLike = (value) => String(value).replace(/[\\%_]/g, '\\$&');

// The audit log, newest first. Actions of the master admin are visible to the master admin only.
const list = async (viewer, query) => {
  const { page, perPage, limit, offset } = paginationParams(query);
  const conditions = [];

  if (!viewer.isMaster) {
    conditions.push({ [Op.or]: [{ actorIsMaster: NO }, { actorIsMaster: null }] });
  }
  if (query.action) conditions.push({ action: { [Op.iLike]: `${escapeLike(query.action)}%` } });
  if (query.entityType) conditions.push({ entityType: query.entityType });
  if (query.from) conditions.push({ createdAt: { [Op.gte]: new Date(`${query.from}T00:00:00`) } });
  if (query.to) conditions.push({ createdAt: { [Op.lte]: new Date(`${query.to}T23:59:59.999`) } });
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    conditions.push({ [Op.or]: [{ description: { [Op.iLike]: term } }, { actorName: { [Op.iLike]: term } }] });
  }

  const { rows, count } = await AuditLog.findAndCountAll({
    where: { [Op.and]: conditions },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
  });

  return AuditLogResource.paginate({ rows, count, page, perPage });
};

module.exports = { list };
