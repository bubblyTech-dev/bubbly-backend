const Request = require('@app/Requests/Request');

// GET /analytics/:key?preset=&from=&to=&compare=&plan=&status=&source=&format=
// plan, status and source are comma separated lists ("a,b,c").
class AnalyticsQueryRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      preset: 'in:today,yesterday,last_7_days,last_30_days,last_90_days,last_12_months,this_month,last_month,this_quarter,this_fiscal_year,last_fiscal_year,custom',
      from: 'date',
      to: 'date',
      compare: 'boolean',
      plan: 'string|max:2000',
      status: 'string|max:200',
      source: 'string|max:200',
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

module.exports = AnalyticsQueryRequest;
