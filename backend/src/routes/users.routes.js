const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const users = require('../controllers/users.controller');

// Everything here is for administrators only.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/', users.listUsers);
router.post('/', users.createUser);
router.put('/:id', users.updateUser);
router.patch('/:id/active', users.setActive);

module.exports = router;
