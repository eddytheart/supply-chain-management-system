const router = require('express').Router();
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const items = require('../controllers/items.controller');

router.use(authenticate);
router.get('/', items.listItems); // everyone logged in needs this for the requisition form
router.post('/', authorize(ROLES.STORE), items.createItem);
router.put('/:id', authorize(ROLES.STORE), items.updateItem);

module.exports = router;
