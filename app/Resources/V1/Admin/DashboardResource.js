const Resource = require('@app/Resources/Resource');
const { rangeForResponse } = require('@app/Helpers/dateRange');
const optionSets = require('@app/Services/V1/Admin/Reports/optionSets');

// Shapes the dashboard numbers for the Admin app. A block the admin may not see arrives as null.
//   DashboardResource.make(await DashboardService.build(admin, query))
class DashboardResource extends Resource {
  toArray() {
    const { range, generatedAt, kpis, charts, attention, panels } = this.resource;

    return {
      range: rangeForResponse(range),
      generatedAt,
      currency: 'INR',
      kpis,
      charts,
      attention,
      panels: {
        recentActivity: panels.recentActivity
          ? panels.recentActivity.map((row) => ({
              uuid: row.uuid,
              action: row.action,
              text: row.description || row.action,
              actorName: row.actorName,
              entityType: row.entityType,
              createdAt: row.createdAt,
            }))
          : null,
        latestSchools: panels.latestSchools
          ? panels.latestSchools.map((row) => ({
              uuid: row.uuid,
              name: row.name,
              city: row.city,
              status: Number(row.status),
              statusLabel: optionSets.label('schoolStatus', row.status),
              planName: row.planName || null,
              createdAt: row.createdAt,
            }))
          : null,
        latestPayments: panels.latestPayments
          ? panels.latestPayments.map((row) => ({
              uuid: row.uuid,
              schoolName: row.schoolName || null,
              amountPaise: Number(row.amountPaise),
              status: Number(row.status),
              statusLabel: optionSets.label('paymentStatus', row.status),
              source: Number(row.source) === 2 ? 'offline' : 'online',
              at: row.at,
            }))
          : null,
        liveAnnouncements: panels.liveAnnouncements
          ? panels.liveAnnouncements.map((row) => ({
              uuid: row.uuid,
              title: row.title,
              type: Number(row.type),
              typeLabel: optionSets.label('announcementType', row.type),
              startsAt: row.startsAt,
              endsAt: row.endsAt,
            }))
          : null,
      },
    };
  }
}

module.exports = DashboardResource;
