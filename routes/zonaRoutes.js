const express = require('express');
const router = express.Router();
const c = require('../controllers/zonaController');

router.get('/', c.index);
router.get('/create', c.create);
router.post('/create', c.store);
router.get('/:id/edit', c.edit);
router.post('/:id/edit', c.update);
router.post('/:id/delete', c.destroy);

module.exports = router;
