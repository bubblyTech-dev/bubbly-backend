const Request = require('@app/Requests/Request');
const AppError = require('@app/Helpers/AppError');
const Settings = require('@app/Helpers/settings');

// PUT /settings/:group  with a body like { "policy.grace_days": 10 }.
// The keys are not fixed, so this class validates against config/settings.js instead of a rules() list.
// Every key must belong to the group in the address; an unknown key is an error. Only keys that were sent are changed.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toInteger = (value) => {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
};

const withinLimits = (number, definition) =>
  (definition.min === undefined || number >= definition.min) && (definition.max === undefined || number <= definition.max);

const limitsText = (definition) => {
  if (definition.min !== undefined && definition.max !== undefined) return ` between ${definition.min} and ${definition.max}`;
  if (definition.min !== undefined) return ` of at least ${definition.min}`;
  if (definition.max !== undefined) return ` of at most ${definition.max}`;
  return '';
};

// returns { value } or { error }
const convert = (definition, raw) => {
  switch (definition.type) {
    case 'string': {
      if (raw !== null && typeof raw !== 'string') return { error: 'This must be text.' };
      const text = (raw || '').trim();
      if (text.length > (definition.maxLength || 200)) return { error: `This must not be longer than ${definition.maxLength || 200} characters.` };
      if (text && definition.format === 'email' && !EMAIL_PATTERN.test(text)) return { error: 'This must be a valid email address.' };
      return { value: text };
    }

    case 'integer': {
      const number = toInteger(raw);
      if (number === null) return { error: 'This must be a whole number.' };
      if (!withinLimits(number, definition)) return { error: `This must be a whole number${limitsText(definition)}.` };
      return { value: number };
    }

    case 'number': {
      const number = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof number !== 'number' || !Number.isFinite(number)) return { error: 'This must be a number.' };
      if (!withinLimits(number, definition)) return { error: `This must be a number${limitsText(definition)}.` };
      return { value: number };
    }

    case 'boolean': {
      if ([true, 1, '1', 'true'].includes(raw)) return { value: true };
      if ([false, 0, '0', 'false'].includes(raw)) return { value: false };
      return { error: 'This must be true or false.' };
    }

    case 'integerList': {
      const parts = Array.isArray(raw) ? raw : String(raw ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      if (parts.length > (definition.maxItems || 10)) return { error: `Use at most ${definition.maxItems || 10} values.` };

      const numbers = [];
      for (const part of parts) {
        const number = toInteger(part);
        if (number === null || !withinLimits(number, definition)) {
          return { error: `Every value must be a whole number${limitsText(definition)}.` };
        }
        numbers.push(number);
      }
      return { value: [...new Set(numbers)].sort((a, b) => b - a) };
    }

    default:
      return { error: 'This setting cannot be edited.' };
  }
};

class UpdateSettingsRequest extends Request {
  authorize(req) {
    return Boolean(req.params.group);
  }

  async validate(req) {
    const group = req.params.group;
    if (!Settings.groups[group]) throw AppError.notFound();

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const errors = {};
    const validated = {};

    if (!Object.keys(body).length) throw AppError.validation({ settings: ['Send at least one setting to save.'] });

    for (const [key, raw] of Object.entries(body)) {
      const definition = Settings.definitionOf(key);
      if (!definition || definition.group !== group) {
        errors[key] = ['This setting does not exist in this group.'];
        continue;
      }

      const result = convert(definition, raw);
      if (result.error) errors[key] = [result.error];
      else validated[key] = result.value;
    }

    return { errors, validated };
  }
}

module.exports = UpdateSettingsRequest;
