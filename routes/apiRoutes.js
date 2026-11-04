const express = require('express');
const router = express.Router();
const c = require('../controllers/apiController');

const { isDevice } = require('../middlewares/auth');

router.get('/health', (req, res) => res.json({ ok: true, app: 'EcoGrow' }));
router.post('/lecturas', isDevice, c.registrarLecturas);
router.get('/comandos/:mac', isDevice, c.comandosPendientes);

module.exports = router;
