const Files = require('@app/Helpers/files');
const { AdminUser } = require('@app/Models');
const AdminUserResource = require('@app/Resources/V1/Admin/AdminUserResource');

const IMAGE_TYPE = 'adminProfile';
const isTrue = (value) => [true, 1, '1', 'true'].includes(value);

// Updates the logged-in admin's own details. A new photo is moved from temp into its real folder here,
// and the old photo is deleted only after the database change succeeded.
const update = async (admin, data) => {
  const adminUser = await AdminUser.findByPk(admin.id);
  const changes = {};

  if (data.name !== undefined) changes.name = data.name;
  if (data.phone !== undefined) changes.phone = data.phone; // null clears it

  const previous = adminUser.profileImage;
  let committed = null;

  if (data.profileImage && data.profileImage !== previous) {
    committed = await Files.commit(IMAGE_TYPE, data.profileImage, { owner: Files.ownerOf(admin), field: 'profileImage' });
    changes.profileImage = committed;
  } else if (isTrue(data.removeProfileImage)) {
    changes.profileImage = null;
  }

  try {
    await adminUser.update(changes);
  } catch (err) {
    if (committed) await Files.remove(IMAGE_TYPE, committed); // do not leave an unused file behind
    throw err;
  }

  if (previous && changes.profileImage !== undefined && changes.profileImage !== previous) {
    await Files.remove(IMAGE_TYPE, previous);
  }

  return AdminUserResource.make(adminUser, { permissions: admin.permissions });
};

module.exports = { update };
