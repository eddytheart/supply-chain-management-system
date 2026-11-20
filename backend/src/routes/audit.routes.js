const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const audit = require('../controllers/audit.controller');

router.get('/', authenticate, authorize(ROLES.ADMIN), audit.listAudit);

module.exports = router;
