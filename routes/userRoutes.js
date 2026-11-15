const express = require('express');
const router = express.Router();
const c = require('../controllers/userController');

router.get('/perfil', c.perfil);
router.post('/perfil', c.actualizarPerfil);
router.get('/configuracion', c.configuracion);
router.post('/configuracion', c.guardarConfiguracion);
router.get('/ia', c.iaForm);
router.post('/ia', c.ia);

module.exports = router;
