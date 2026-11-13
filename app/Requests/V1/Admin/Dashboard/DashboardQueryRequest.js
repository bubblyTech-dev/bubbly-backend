const Request = require('@app/Requests/Request');

// GET /dashboard?preset=&from=&to=
// The dashboard always compares with the period before, so there is no compare switch.
class DashboardQueryRequest extends Request {
  source() {
    return 'query';
  }

  rules() {
    return {
      preset: 'in:today,yesterday,last_7_days,last_30_days,last_90_days,last_12_months,this_month,last_month,this_quarter,this_fiscal_year,last_fiscal_year,custom',
      from: 'date',
      to: 'date',
    };
  }

  messages() {
    return { 'preset.in': 'Choose a valid date range.' };
  }
}

module.exports = DashboardQueryRequest;
