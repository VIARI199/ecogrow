const express = require('express');
const router = express.Router();
const c = require('../controllers/lecturaController');

router.get('/', c.index);
router.post('/:id/delete', c.destroy);

module.exports = router;
