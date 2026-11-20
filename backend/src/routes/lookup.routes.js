const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const lookup = require('../controllers/lookup.controller');

router.get('/roles', authenticate, lookup.listRoles);
router.get('/departments', authenticate, lookup.listDepartments);

module.exports = router;
