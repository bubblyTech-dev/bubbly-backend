const Request = require('@app/Requests/Request');

// limits  { max_students: 100, max_teachers: null }   null means unlimited (keys are in config/plans.js)
// modules ['<module uuid>', ...]                       core modules are always added by the server
// features ['Unlimited attendance records', { title: 'Fees', moduleKey: 'fees' }, ...]  a text line, or a line that also unlocks a module
//          (core modules are always included; the plan's modules follow the links). Max 30, each 1-200 characters
class StorePlanRequest extends Request {
  rules() {
    return {
      name: 'required|string|min:2|max:150',
      slug: 'string|max:150',
      description: 'nullable|string|max:1000',
      pricePaise: 'required|integer|min:0',
      billingInterval: 'required|in:1,2,3',
      taxInclusive: 'boolean',
      isFeatured: 'boolean',
      sortOrder: 'integer|min:0',
      limits: 'nullable',
      modules: 'nullable',
      features: 'array',
    };
  }

  attributes() {
    return { pricePaise: 'price', billingInterval: 'billing interval', sortOrder: 'sort order' };
  }

  messages() {
    return {
      'billingInterval.in': 'Choose monthly, quarterly or yearly.',
      'pricePaise.integer': 'The price must be a whole number of paise.',
    };
  }
}

module.exports = StorePlanRequest;
