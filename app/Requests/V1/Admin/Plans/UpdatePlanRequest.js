const Request = require('@app/Requests/Request');

// Send only what changed. `features` replaces the whole list (an empty list clears it). A published plan keeps its price and billing interval (see PlanService).
class UpdatePlanRequest extends Request {
  rules() {
    return {
      name: 'string|min:2|max:150',
      slug: 'string|max:150',
      description: 'nullable|string|max:1000',
      pricePaise: 'integer|min:0',
      billingInterval: 'in:1,2,3',
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

module.exports = UpdatePlanRequest;
