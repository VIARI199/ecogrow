const express = require('express');
const router = express.Router();
const c = require('../controllers/authController');

router.get('/login', c.loginForm);
router.post('/login', c.login);
router.get('/olvide-contrasena', c.recuperarContrasenaForm);
router.post('/olvide-contrasena', c.solicitarCodigoRecuperacion);
router.post('/restablecer-contrasena', c.restablecerContrasena);
router.get('/registro', c.registroForm);
router.post('/registro', c.registro);
router.post('/auth/google', c.googleAuth);
router.get('/logout', c.logout);

module.exports = router;
