const Request = require('@app/Requests/Request');

// GET /reports/:key?preset=&from=&to=&compare=&page=&perPage=&format=  (+ the report's own filters, read by the report service)
class ReportQueryRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      preset: 'in:today,yesterday,last_7_days,last_30_days,last_90_days,last_12_months,this_month,last_month,this_quarter,this_fiscal_year,last_fiscal_year,custom',
      from: 'date',
      to: 'date',
      compare: 'boolean',
      page: 'integer|min:1',
      perPage: 'integer|min:1|max:100',
      format: 'in:csv,xlsx',
    };
  }

  messages() {
    return {
      'preset.in': 'Choose a valid date range.',
      'format.in': 'Choose CSV or Excel.',
    };
  }
}

module.exports = ReportQueryRequest;
