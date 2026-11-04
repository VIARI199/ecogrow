const express = require('express');
const router = express.Router();
const c = require('../controllers/publicController');

router.get('/', c.inicio);
router.get('/nosotros', c.nosotros);
router.get('/contacto', c.contactoForm);
router.post('/contacto', c.contactoEnviar);

module.exports = router;
