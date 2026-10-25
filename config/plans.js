// What a plan can limit and how often it bills. The Admin app reads this from GET /api/v1/admin/plans/options,
// so a new limit is added here once and appears in the plan form.

module.exports = {
  // a limit with no value (null) means unlimited
  limits: [
    { key: 'max_students', label: 'Students' },
    { key: 'max_teachers', label: 'Teachers' },
    { key: 'max_classes', label: 'Classes' },
    { key: 'storage_mb', label: 'Storage (MB)' },
  ],

  intervals: [
    { value: 1, label: 'Monthly' },
    { value: 2, label: 'Quarterly' },
    { value: 3, label: 'Yearly' },
  ],
};
