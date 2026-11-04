const express = require('express');
const router = express.Router();
const c = require('../controllers/alertaController');

router.get('/', c.index);
router.post('/:id/estado', c.cambiarEstado);
router.post('/:id/delete', c.destroy);

module.exports = router;
