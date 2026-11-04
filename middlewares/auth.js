const db = require('../config/db');

// Solo usuarios con sesión iniciada Y con la cuenta todavía activa.
// Se revisa la base de datos en cada petición, para que suspender o dar de baja surta efecto al instante.
const isAuth = async (req, res, next) => {
    if (!req.session.usuario) {
        req.flash('error', 'Debes iniciar sesión para continuar.');
        return res.redirect('/login');
    }
    try {
        const [rows] = await db.query(
            `SELECT u.estado, r.nombre_rol FROM usuario u
             JOIN rol r ON u.ID_rol = r.ID_rol WHERE u.ID_usuario = ?`, [req.session.usuario.id]);
        if (rows.length === 0 || rows[0].estado !== 'Activo') {
            // La cuenta fue suspendida, dada de baja o eliminada: se saca al usuario de la sesión
            delete req.session.usuario;
            req.flash('error', 'Tu cuenta fue suspendida o dada de baja. Contacta al administrador.');
            return res.redirect('/login');
        }
        req.session.usuario.rol = rows[0].nombre_rol;
        const [perfil] = await db.query('SELECT imagen_perfil FROM usuario WHERE ID_usuario = ?', [req.session.usuario.id]);
        req.session.usuario.imagen_perfil = perfil[0] ? perfil[0].imagen_perfil : null;
        next();
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// Solo administradores
const isAdmin = (req, res, next) => {
    if (req.session.usuario && req.session.usuario.rol === 'Administrador') return next();
    req.flash('error', 'No tienes permisos de administrador.');
    res.redirect('/app');
};

// Solo el ESP32: compara el header "x-device-key" con DEVICE_KEY del .env
const isDevice = (req, res, next) => {
    if (!process.env.DEVICE_KEY) {
        return res.status(503).json({ ok: false, error: 'La API de dispositivos no está configurada' });
    }
    if (req.get('x-device-key') === process.env.DEVICE_KEY) return next();
    res.status(401).json({ ok: false, error: 'Clave de dispositivo inválida' });
};

module.exports = { isAuth, isAdmin, isDevice };