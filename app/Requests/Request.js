const rules = require('@app/Rules');

// Base class for every validation class (one per action), in the style of a Laravel FormRequest.
//
//   class LoginRequest extends Request {
//     rules()    { return { email: 'required|email', password: 'required|string' }; }
//     messages() { return { 'email.required': 'Please enter your email.' }; }
//   }
//
// Only the keys listed in rules() reach the controller (req.validated). Anything else in the request is dropped,
// so a caller can never slip in a client_id or a role.
// Add `nullable` to a field to let it be cleared: an empty value is then saved as null instead of being skipped.

class Request {
  // where the data is read from: 'body', 'query' or 'params'
  source() { return 'body'; }

  authorize() { return true; }

  rules() { return {}; }

  messages() { return {}; }

  // friendly names used in messages, for example { currentPassword: 'current password' }
  attributes() { return {}; }

  async validate(req) {
    const data = req[this.source()] || {};
    const ruleMap = this.rules();
    const custom = this.messages();
    const names = this.attributes();
    const errors = {};
    const validated = {};

    for (const [field, ruleString] of Object.entries(ruleMap)) {
      const parsed = String(ruleString).split('|').filter(Boolean).map((part) => {
        const index = part.indexOf(':');
        return index === -1 ? { name: part, param: undefined } : { name: part.slice(0, index), param: part.slice(index + 1) };
      });

      let value = data[field];
      if (typeof value === 'string') value = value.trim();

      const isEmpty = value === undefined || value === null || value === '';
      const required = parsed.some((r) => r.name === 'required');

      if (isEmpty) {
        if (required) errors[field] = [this.format(field, 'required', undefined, custom, names)];
        // a field marked nullable that was sent empty is saved as null (so it can be cleared); otherwise it is left out
        else if (value !== undefined && parsed.some((r) => r.name === 'nullable')) validated[field] = null;
        continue;
      }

      for (const { name, param } of parsed) {
        if (name === 'required' || name === 'nullable') continue;
        const rule = rules[name];
        if (!rule) throw new Error(`Unknown validation rule "${name}" on field "${field}"`);
        const ok = await rule.test(value, param, { field, data, req });
        if (!ok) {
          (errors[field] = errors[field] || []).push(this.format(field, name, param, custom, names));
          break; // one message per field is enough
        }
      }

      if (!errors[field]) validated[field] = value;
    }

    return { errors, validated };
  }

  format(field, ruleName, param, custom, names) {
    const label = names[field] || field.replace(/([A-Z])/g, ' $1').toLowerCase();
    const template = custom[`${field}.${ruleName}`] || rules[ruleName].message;
    return template.replace(':field', label).replace(':param', param ?? '');
  }
}

module.exports = Request;
