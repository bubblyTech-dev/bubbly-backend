require('dotenv').config();
const { QueryTypes } = require('sequelize');
const { adminPermissions } = require('../../config/permissions');
const password = require('../../app/Helpers/password');
const { ADMIN_TYPE, ADMIN_STATUS } = require('../../app/Helpers/constants');

// Safe to run again: it only adds what is missing and refreshes permission labels.
//   1. syncs the permission list from config/permissions.js into admin_permissions
//   2. creates the master admin (type 1, always has every permission) and one sub admin (type 2, no permissions yet)
// Emails and first passwords come from .env (SEED_MASTER_* and SEED_SUBADMIN_*). Both must change the password at first login.

const accounts = () => [
  { name: process.env.SEED_MASTER_NAME || 'Master Admin', email: process.env.SEED_MASTER_EMAIL, password: process.env.SEED_MASTER_PASSWORD, type: ADMIN_TYPE.MASTER, label: 'master admin' },
  { name: process.env.SEED_SUBADMIN_NAME || 'Sub Admin', email: process.env.SEED_SUBADMIN_EMAIL, password: process.env.SEED_SUBADMIN_PASSWORD, type: ADMIN_TYPE.STAFF, label: 'sub admin' },
];

module.exports = {
  async up(queryInterface) {
    const db = queryInterface.sequelize;

    // validate first so nothing is half-seeded
    for (const a of accounts()) {
      if (!a.email || !a.password) throw new Error(`Set SEED_${a.type === ADMIN_TYPE.MASTER ? 'MASTER' : 'SUBADMIN'}_EMAIL and _PASSWORD in .env`);
      if (a.password.length < 8) throw new Error(`The ${a.label} password in .env must be at least 8 characters`);
    }

    // 1. permissions
    const existing = await db.query('SELECT id, permission_key FROM admin_permissions', { type: QueryTypes.SELECT });
    const byKey = new Map(existing.map((row) => [row.permission_key, row.id]));
    let added = 0;
    for (const p of adminPermissions) {
      if (byKey.has(p.key)) {
        await db.query('UPDATE admin_permissions SET name = :name, module = :module, sort_order = :sortOrder, updated_at = NOW() WHERE id = :id', {
          replacements: { name: p.name, module: p.module, sortOrder: p.sortOrder, id: byKey.get(p.key) },
        });
      } else {
        await db.query('INSERT INTO admin_permissions (permission_key, name, module, sort_order) VALUES (:key, :name, :module, :sortOrder)', {
          replacements: { key: p.key, name: p.name, module: p.module, sortOrder: p.sortOrder },
        });
        added += 1;
      }
    }

    // 2. accounts
    let created = 0;
    for (const a of accounts()) {
      const email = a.email.trim().toLowerCase();
      const found = await db.query('SELECT id FROM admin_users WHERE email = :email AND deleted_at IS NULL', { replacements: { email }, type: QueryTypes.SELECT });
      if (found.length) continue;
      await db.query(
        `INSERT INTO admin_users (name, email, password_hash, type, status, must_change_password, failed_login_count, password_changed_at)
         VALUES (:name, :email, :hash, :type, :status, 1, 0, NOW())`,
        { replacements: { name: a.name, email, hash: await password.hash(a.password), type: a.type, status: ADMIN_STATUS.ACTIVE } },
      );
      created += 1;
    }

    console.log(`  admin permissions: ${added} added, ${adminPermissions.length - added} refreshed | admin accounts created: ${created}`);
  },

  async down(queryInterface) {
    const db = queryInterface.sequelize;
    const emails = accounts().map((a) => (a.email || '').trim().toLowerCase()).filter(Boolean);
    if (emails.length) await db.query('DELETE FROM admin_users WHERE email IN (:emails)', { replacements: { emails } });
    await db.query('DELETE FROM admin_permissions');
  },
};
