const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const po = require('../controllers/purchaseOrders.controller');

router.use(authenticate);

router.get('/', authorize(ROLES.PROCUREMENT, ROLES.STORE, ROLES.ADMIN), po.listPurchaseOrders);
router.get('/:id', authorize(ROLES.PROCUREMENT, ROLES.STORE, ROLES.ADMIN), po.getPurchaseOrder);
router.post('/', authorize(ROLES.PROCUREMENT), po.createPurchaseOrder);
router.post('/:id/receipts', authorize(ROLES.STORE), po.receiveGoods);
router.patch('/:id/close', authorize(ROLES.PROCUREMENT), po.closePurchaseOrder);

module.exports = router;
