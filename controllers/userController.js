const db = require('../config/db');
const { correoValido } = require('./authController');

const perfil = async (req, res) => {
    const [rows] = await db.query(
        'SELECT nombre, correo, fecha_registro, imagen_perfil FROM usuario WHERE ID_usuario = ?',
        [req.session.usuario.id]
    );
    if (rows.length === 0) return res.status(404).render('404');
    res.render('perfil', { perfil: rows[0] });
};

const actualizarPerfil = async (req, res) => {
    const nombre = (req.body.nombre || '').trim();
    const correo = (req.body.correo || '').trim().toLowerCase();
    if (!nombre || !correo) {
        req.flash('error', 'Nombre y correo son obligatorios.');
        return res.redirect('/app/perfil');
    }
    if (!correoValido(correo)) {
        req.flash('error', 'Usa un correo de Gmail, Hotmail, Outlook, Yahoo o iCloud válido.');
        return res.redirect('/app/perfil');
    }
    const imagen = (req.body.imagen_perfil || '').trim();
    if (imagen && !/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\r\n]+$/i.test(imagen)) {
        req.flash('error', 'La imagen de perfil no tiene un formato válido.');
        return res.redirect('/app/perfil');
    }
    if (imagen.length > 4 * 1024 * 1024) {
        req.flash('error', 'La imagen de perfil no puede superar 3 MB.');
        return res.redirect('/app/perfil');
    }
    try {
        await db.query('UPDATE usuario SET nombre = ?, correo = ?, imagen_perfil = ? WHERE ID_usuario = ?',
            [nombre, correo, imagen || null, req.session.usuario.id]);
        req.session.usuario.nombre = nombre;
        req.session.usuario.correo = correo;
        req.flash('success', 'Perfil actualizado correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', error.code === 'ER_DUP_ENTRY' ? 'Ese correo ya está registrado.' : 'No se pudo actualizar el perfil.');
    }
    res.redirect('/app/perfil');
};

const configuracion = (req, res) => res.render('configuracion', {
    preferencias: req.session.preferencias || { notificaciones: true, unidad: 'C', compacto: false }
});

const guardarConfiguracion = (req, res) => {
    req.session.preferencias = {
        notificaciones: req.body.notificaciones === 'on',
        unidad: req.body.unidad === 'F' ? 'F' : 'C',
        compacto: req.body.compacto === 'on'
    };
    req.flash('success', 'Preferencias guardadas.');
    res.redirect('/app/configuracion');
};

const ia = (req, res) => {
    const question = (req.body.pregunta || '').trim();
    let respuesta = 'Cuéntame qué observas en tus plantas y revisaré los datos disponibles para orientarte.';
    if (/amarill|punta|hoja/i.test(question)) {
        respuesta = 'Las puntas amarillas pueden relacionarse con exceso de riego, acumulación de sales o falta de nutrientes. Revisa primero la humedad del suelo y evita fertilizar hasta confirmar la causa.';
    } else if (/luz|hora/i.test(question)) {
        respuesta = 'La cantidad de luz depende de la especie. Consulta la ficha de tu planta para comparar el rango recomendado con la medición BH1750.';
    } else if (/riego|seca|humedad/i.test(question)) {
        respuesta = 'Comprueba la humedad del suelo antes de regar. Si está por debajo del mínimo recomendado, riega de forma gradual y vuelve a medir después de unos minutos.';
    }
    res.render('ia', { pregunta: question, respuesta });
};

const camara = async (req, res) => {
    try {
        const [dispositivos] = await db.query(`
            SELECT nombre,
                   CASE
                       WHEN estado = 'Mantenimiento' THEN 'Mantenimiento'
                       WHEN estado = 'Online' AND ultima_comunicacion >= NOW() - INTERVAL 90 SECOND THEN 'Online'
                       ELSE 'Offline'
                   END AS estado,
                   ultima_comunicacion
            FROM dispositivo
            WHERE tipo_controlador LIKE '%CAM%' OR nombre LIKE '%CAM%'
            ORDER BY ultima_comunicacion DESC LIMIT 1`);
        const dispositivo = dispositivos[0] || null;
        res.render('camara', {
            dispositivo,
            analisis: dispositivo && dispositivo.estado === 'Online'
                ? 'Nodo de cámara conectado. La transmisión visual se habilitará al configurar su URL de captura.'
                : 'No hay un ESP32-CAM conectado. Se muestra una imagen de referencia hasta configurar el nodo.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('No se pudo consultar el estado de la cámara');
    }
};

module.exports = { perfil, actualizarPerfil, configuracion, guardarConfiguracion, ia, camara };
