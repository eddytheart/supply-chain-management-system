const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const reports = require('../controllers/reports.controller');

router.use(authenticate, authorize(ROLES.STORE, ROLES.PROCUREMENT, ROLES.ADMIN));

router.get('/requisitions', reports.requisitionsReport);
router.get('/stock', reports.stockReport);
router.get('/low-stock', reports.lowStockReport);
router.get('/purchase-orders', reports.purchaseOrdersReport);

module.exports = router;
