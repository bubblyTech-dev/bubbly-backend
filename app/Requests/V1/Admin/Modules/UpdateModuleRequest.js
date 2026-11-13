const Request = require('@app/Requests/Request');

// The module key never changes. Core modules cannot be made inactive.
class UpdateModuleRequest extends Request {
  rules() {
    return {
      name: 'string|min:2|max:120',
      description: 'nullable|string|max:300',
      status: 'in:1,2',
      sortOrder: 'integer|min:0',
    };
  }

  attributes() {
    return { sortOrder: 'sort order' };
  }
}

module.exports = UpdateModuleRequest;
