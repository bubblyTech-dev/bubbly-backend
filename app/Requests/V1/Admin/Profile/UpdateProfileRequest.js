const Request = require('@app/Requests/Request');

// Send only what changed.
//   profileImage        the temp name returned by POST /admin/files/upload
//   removeProfileImage  true to delete the current photo
// An empty phone clears it (nullable). The name cannot be emptied.
class UpdateProfileRequest extends Request {
  rules() {
    return {
      name: 'string|max:150',
      phone: 'nullable|string|max:30',
      profileImage: 'string|max:120',
      removeProfileImage: 'boolean',
    };
  }

  attributes() {
    return { profileImage: 'profile image' };
  }
}

module.exports = UpdateProfileRequest;
