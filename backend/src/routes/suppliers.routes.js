const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const suppliers = require('../controllers/suppliers.controller');

router.use(authenticate);

// Procurement, store and admin staff can look. Only the procurement officer can change.
const canView = authorize(ROLES.PROCUREMENT, ROLES.STORE, ROLES.ADMIN);
const canEdit = authorize(ROLES.PROCUREMENT);

router.get('/', canView, suppliers.listSuppliers);
router.get('/:id', canView, suppliers.getSupplier);
router.post('/', canEdit, suppliers.createSupplier);
router.put('/:id', canEdit, suppliers.updateSupplier);
router.patch('/:id/active', canEdit, suppliers.setSupplierActive);
router.put('/:id/items/:itemId', canEdit, suppliers.setSupplierPrice);

module.exports = router;
