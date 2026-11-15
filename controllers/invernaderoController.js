const db = require('../config/db');

const ESTADOS = ['Activo', 'En mantenimiento', 'Inactivo'];

// LISTAR
const index = async (req, res) => {
    try {
        const [invernaderos] = await db.query(`
            SELECT i.*, COUNT(z.ID_zona) AS total_zonas
            FROM invernadero i
            JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
            LEFT JOIN zona z ON z.ID_invernadero = i.ID_invernadero
            WHERE ui.ID_usuario = ?
            GROUP BY i.ID_invernadero ORDER BY i.ID_invernadero DESC`, [req.session.usuario.id]);
        res.render('invernaderos/index', { invernaderos, baseUrl: req.baseUrl });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// FORMULARIO CREAR
const getDispositivos = async (usuarioId) => {
    const [dispositivos] = await db.query(`
        SELECT d.ID_dispositivo, d.nombre, d.mac_address, d.estado,
               i.nombre AS invernadero, z.nombre_zona
        FROM dispositivo d
        JOIN zona z ON z.ID_zona = d.ID_zona
        JOIN invernadero i ON i.ID_invernadero = z.ID_invernadero
        JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
        WHERE ui.ID_usuario = ? AND LOWER(d.tipo_controlador) LIKE '%esp32%'
        ORDER BY d.ID_dispositivo`, [usuarioId]);
    return dispositivos;
};

const create = async (req, res) => {
    try {
        res.render('invernaderos/form', {
            item: {}, estados: ESTADOS, dispositivos: await getDispositivos(req.session.usuario.id),
            accion: `${req.baseUrl}/create`
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// GUARDAR
const store = async (req, res) => {
    let connection;
    let transaccionIniciada = false;
    try {
        const { nombre, ubicacion, fecha_creacion, descripcion, estado, ID_dispositivo } = req.body;
        let invernaderoOrigen;
        if (!nombre || !ubicacion || !fecha_creacion) {
            req.flash('error', 'Nombre, ubicación y fecha son obligatorios.');
            return res.redirect(`${req.baseUrl}/create`);
        }
        connection = await db.getConnection();
        await connection.beginTransaction();
        transaccionIniciada = true;

        if (ID_dispositivo) {
            const [dispositivos] = await connection.query(`
                SELECT d.ID_dispositivo, ui.ID_invernadero AS invernadero_origen
                FROM dispositivo d
                JOIN zona z ON z.ID_zona = d.ID_zona
                JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
                WHERE d.ID_dispositivo = ? AND ui.ID_usuario = ?
                  AND LOWER(d.tipo_controlador) LIKE '%esp32%'
                FOR UPDATE`,
            [ID_dispositivo, req.session.usuario.id]);
            if (dispositivos.length === 0) {
                await connection.rollback();
                transaccionIniciada = false;
                req.flash('error', 'Selecciona un ESP32 registrado y asociado a tu cuenta.');
                return res.redirect(`${req.baseUrl}/create`);
            }
            invernaderoOrigen = dispositivos[0].invernadero_origen;
        }

        const [result] = await connection.query(
            'INSERT INTO invernadero (nombre, ubicacion, fecha_creacion, descripcion, estado) VALUES (?, ?, ?, ?, ?)',
            [nombre, ubicacion, fecha_creacion, descripcion || null, estado || 'Activo']);
        await connection.query(
            "INSERT INTO usuario_invernadero (ID_usuario, ID_invernadero, rol_en_invernadero) VALUES (?, ?, 'Propietario')",
            [req.session.usuario.id, result.insertId]);

        if (ID_dispositivo) {
            await connection.query(`
                INSERT INTO usuario_invernadero (ID_usuario, ID_invernadero, rol_en_invernadero)
                SELECT ID_usuario, ?, rol_en_invernadero
                FROM usuario_invernadero
                WHERE ID_invernadero = ? AND ID_usuario <> ?`,
            [result.insertId, invernaderoOrigen, req.session.usuario.id]);

            const [zona] = await connection.query(
                'INSERT INTO zona (nombre_zona, descripcion, ID_invernadero) VALUES (?, ?, ?)',
                ['Zona ESP32', 'Zona creada para el ESP32 seleccionado', result.insertId]);
            await connection.query('UPDATE dispositivo SET ID_zona = ? WHERE ID_dispositivo = ?',
                [zona.insertId, ID_dispositivo]);
        }

        await connection.commit();
        transaccionIniciada = false;
        req.flash('success', ID_dispositivo
            ? 'Invernadero creado y ESP32 asignado a su nueva zona.'
            : 'Invernadero creado correctamente.');
    } catch (error) {
        console.error(error);
        if (connection && transaccionIniciada) await connection.rollback();
        req.flash('error', 'Ocurrió un error al crear el invernadero.');
    } finally {
        if (connection) connection.release();
    }
    res.redirect(req.baseUrl);
};

// VER (con sus zonas)
const show = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`
            SELECT i.* FROM invernadero i
            JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
            WHERE i.ID_invernadero = ? AND ui.ID_usuario = ?`, [id, req.session.usuario.id]);
        if (rows.length === 0) return res.status(404).render('404');
        const [zonas] = await db.query(`
            SELECT z.*, e.nombre_comun AS especie, p.estado AS estado_plantacion,
                   ROUND(AVG(CASE WHEN m.nombre_variable = 'temperatura' THEN l.valor END), 1) AS temperatura,
                   ROUND(AVG(CASE WHEN m.nombre_variable IN ('humedad_ambiente', 'humedad_suelo') THEN l.valor END), 1) AS humedad
            FROM zona z
            LEFT JOIN plantacion p ON p.ID_zona = z.ID_zona AND p.estado <> 'Finalizado'
            LEFT JOIN especie e ON p.ID_especie = e.ID_especie
            LEFT JOIN dispositivo d ON d.ID_zona = z.ID_zona
            LEFT JOIN sensor s ON s.ID_dispositivo = d.ID_dispositivo
            LEFT JOIN metrica m ON m.ID_sensor = s.ID_sensor
            LEFT JOIN lectura_sensor l ON l.ID_metrica = m.ID_metrica
            WHERE z.ID_invernadero = ?
            GROUP BY z.ID_zona, e.nombre_comun, p.estado`, [id]);
        res.render('invernaderos/show', { invernadero: rows[0], zonas, baseUrl: req.baseUrl });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// FORMULARIO EDITAR
const edit = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT i.* FROM invernadero i
            JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
            WHERE i.ID_invernadero = ? AND ui.ID_usuario = ?`,
            [req.params.id, req.session.usuario.id]);
        if (rows.length === 0) return res.status(404).render('404');
        res.render('invernaderos/form', { item: rows[0], estados: ESTADOS, accion: `${req.baseUrl}/${req.params.id}/edit` });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// ACTUALIZAR
const update = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, ubicacion, fecha_creacion, descripcion, estado } = req.body;
        if (!nombre || !ubicacion || !fecha_creacion) {
            req.flash('error', 'Nombre, ubicación y fecha son obligatorios.');
            return res.redirect(`${req.baseUrl}/${id}/edit`);
        }
        await db.query(
            `UPDATE invernadero SET nombre = ?, ubicacion = ?, fecha_creacion = ?, descripcion = ?, estado = ?
             WHERE ID_invernadero = ? AND ID_invernadero IN
             (SELECT ID_invernadero FROM usuario_invernadero WHERE ID_usuario = ?)`,
            [nombre, ubicacion, fecha_creacion, descripcion || null, estado, id, req.session.usuario.id]);
        req.flash('success', 'Invernadero actualizado correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al actualizar el invernadero.');
    }
    res.redirect(req.baseUrl);
};

// ELIMINAR
const destroy = async (req, res) => {
    try {
        await db.query(`DELETE FROM invernadero
            WHERE ID_invernadero = ? AND ID_invernadero IN
            (SELECT ID_invernadero FROM usuario_invernadero WHERE ID_usuario = ?)`,
            [req.params.id, req.session.usuario.id]);
        req.flash('success', 'Invernadero eliminado correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se puede eliminar: el invernadero tiene zonas asociadas.');
    }
    res.redirect(req.baseUrl);
};

module.exports = { index, create, store, show, edit, update, destroy };
