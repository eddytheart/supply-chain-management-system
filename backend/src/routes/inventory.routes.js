const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const inventory = require('../controllers/inventory.controller');

router.use(authenticate);

const canView = authorize(ROLES.STORE, ROLES.PROCUREMENT, ROLES.ADMIN);

router.get('/stock', canView, inventory.listStock);                    // add ?lowOnly=true for reorder alerts
router.get('/stock/:itemId/batches', canView, inventory.listBatches);
router.post('/adjustments', authorize(ROLES.STORE), inventory.adjustStock);

module.exports = router;
