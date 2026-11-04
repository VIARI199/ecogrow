const express = require('express');
const router = express.Router();
const c = require('../controllers/dashboardController');

router.get('/', c.index);
router.get('/datos', c.datos);

module.exports = router;
