const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const requisitions = require('../controllers/requisitions.controller');
const inventory = require('../controllers/inventory.controller');

router.use(authenticate);

router.post('/', authorize(ROLES.REQUESTER), requisitions.createRequisition);
router.get('/', requisitions.listRequisitions);
router.get('/:id', requisitions.getRequisition);
router.patch('/:id/decision', authorize(ROLES.PROCUREMENT), requisitions.decide);

router.get('/:id/stock-check', authorize(ROLES.STORE, ROLES.PROCUREMENT), inventory.stockCheck);
router.post('/:id/issue', authorize(ROLES.STORE), inventory.issueStock);
router.patch('/:id/close', authorize(ROLES.REQUESTER, ROLES.PROCUREMENT), requisitions.closeRequisition);

module.exports = router;
