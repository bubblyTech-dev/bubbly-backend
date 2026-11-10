const express = require('express');
const BillingController = require('@app/Controllers/V1/Admin/BillingController');
const requirePermission = require('@app/Middleware/requirePermission');
const validate = require('@app/Middleware/validate');
const ListWebhookEventsRequest = require('@app/Requests/V1/Admin/Billing/ListWebhookEventsRequest');
const ListPaymentsRequest = require('@app/Requests/V1/Admin/Billing/ListPaymentsRequest');
const ListInvoicesRequest = require('@app/Requests/V1/Admin/Billing/ListInvoicesRequest');

const router = express.Router();

// Billing pages (the admin group already ran authenticateAdmin). Mounted at /webhook-events, /payments, /invoices.
const webhookEvents = express.Router();
webhookEvents.get('/', requirePermission('billing.view'), validate(ListWebhookEventsRequest), BillingController.events);
webhookEvents.get('/:uuid', requirePermission('billing.view'), BillingController.showEvent);
webhookEvents.post('/:uuid/reprocess', requirePermission('subscriptions.manage'), BillingController.reprocessEvent);

const payments = express.Router();
payments.get('/', requirePermission('billing.view'), validate(ListPaymentsRequest), BillingController.payments);
payments.get('/:uuid', requirePermission('billing.view'), BillingController.showPayment);

const invoices = express.Router();
invoices.get('/', requirePermission('billing.view'), validate(ListInvoicesRequest), BillingController.invoices);
invoices.get('/:uuid', requirePermission('billing.view'), BillingController.showInvoice);

router.use('/webhook-events', webhookEvents);
router.use('/payments', payments);
router.use('/invoices', invoices);

module.exports = router;
