// Base class for API output, in the style of a Laravel API Resource.
//
//   class AdminUserResource extends Resource {
//     toArray() {                                   // this.resource = the model, this.extra = the second argument
//       return { uuid: this.resource.uuid, permissions: this.extra.permissions };
//     }
//   }
//
//   AdminUserResource.make(admin, { permissions })          one item  -> plain object
//   AdminUserResource.collection(admins)                    a list    -> array of plain objects
//   AdminUserResource.paginate({ rows, count, page, perPage })   -> { data: [...], meta: { page, perPage, total, lastPage } }
//
// Only what toArray() returns ever leaves the server. Use this.when(condition, value) for optional fields.

class Resource {
  constructor(resource, extra = {}) {
    this.resource = resource;
    this.extra = extra;
  }

  toArray() {
    return {};
  }

  // the field is left out of the output when the condition is false (value may be a function)
  when(condition, value) {
    if (!condition) return undefined;
    return typeof value === 'function' ? value() : value;
  }

  // the field is only output when the relation was loaded with the model
  whenLoaded(relation, value) {
    return this.when(this.resource && this.resource[relation] !== undefined, value);
  }

  resolve() {
    if (this.resource === null || this.resource === undefined) return null;
    const output = this.toArray();
    for (const key of Object.keys(output)) if (output[key] === undefined) delete output[key];
    return output;
  }

  static make(resource, extra) {
    return new this(resource, extra).resolve();
  }

  static collection(items = [], extra) {
    return items.map((item) => this.make(item, extra));
  }

  // pass what findAndCountAll returned plus the page numbers
  static paginate({ rows, count, page, perPage }, extra) {
    return {
      data: this.collection(rows, extra),
      meta: { page, perPage, total: count, lastPage: Math.max(1, Math.ceil(count / perPage)) },
    };
  }
}

module.exports = Resource;
