const db = require('../config/db');

const ESTADOS = ['Online', 'Offline', 'Mantenimiento'];

const accesoDispositivo = async (id, usuarioId) => {
    const [rows] = await db.query(`
        SELECT 1 FROM dispositivo d
        JOIN zona z ON z.ID_zona = d.ID_zona
        JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
        WHERE d.ID_dispositivo = ? AND ui.ID_usuario = ?`, [id, usuarioId]);
    return rows.length > 0;
};

const getZonas = async (usuarioId) => {
    const [zonas] = await db.query(`
        SELECT z.ID_zona, CONCAT(i.nombre, ' · ', z.nombre_zona) AS nombre
        FROM zona z JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
        JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
        WHERE ui.ID_usuario = ? ORDER BY nombre`, [usuarioId]);
    return zonas;
};

// LISTAR
const index = async (req, res) => {
    try {
        const [dispositivos] = await db.query(`
            SELECT d.ID_dispositivo, d.mac_address, d.nombre, d.tipo_controlador,
                   d.firmware_version, d.ultima_comunicacion, d.ID_zona,
                   z.nombre_zona, i.nombre AS invernadero,
                   d.estado AS estado_configurado,
                   CASE
                       WHEN d.estado = 'Mantenimiento' THEN 'Mantenimiento'
                       WHEN d.estado = 'Online' AND d.ultima_comunicacion >= NOW() - INTERVAL 90 SECOND THEN 'Online'
                       ELSE 'Offline'
                   END AS estado,
                   (SELECT COUNT(*) FROM sensor s WHERE s.ID_dispositivo = d.ID_dispositivo) AS total_sensores
            FROM dispositivo d
            JOIN zona z ON d.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero AND ui.ID_usuario = ?
            ORDER BY d.ID_dispositivo DESC`, [req.session.usuario.id]);
        res.render('dispositivos/index', { dispositivos });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// VER: sensores, métricas y actuadores del ESP32
const show = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`
            SELECT d.ID_dispositivo, d.mac_address, d.nombre, d.tipo_controlador,
                   d.firmware_version, d.ultima_comunicacion, d.ID_zona,
                   d.estado AS estado_configurado,
                   CASE
                       WHEN d.estado = 'Mantenimiento' THEN 'Mantenimiento'
                       WHEN d.estado = 'Online' AND d.ultima_comunicacion >= NOW() - INTERVAL 90 SECOND THEN 'Online'
                       ELSE 'Offline'
                   END AS estado
            FROM dispositivo d
            JOIN zona z ON z.ID_zona = d.ID_zona
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE d.ID_dispositivo = ? AND ui.ID_usuario = ?`, [id, req.session.usuario.id]);
        if (rows.length === 0) return res.status(404).render('404');
        const [sensores] = await db.query(`
            SELECT s.*, GROUP_CONCAT(CONCAT(m.nombre_variable, ' (', m.unidad_medida, ')') SEPARATOR ', ') AS metricas
            FROM sensor s LEFT JOIN metrica m ON m.ID_sensor = s.ID_sensor
            WHERE s.ID_dispositivo = ? GROUP BY s.ID_sensor`, [id]);
        const [actuadores] = await db.query('SELECT * FROM actuador WHERE ID_dispositivo = ?', [id]);
        res.render('dispositivos/show', { dispositivo: rows[0], sensores, actuadores, baseUrl: req.baseUrl });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// FORMULARIO CREAR
const create = async (req, res) => {
    res.render('dispositivos/form', { item: {}, zonas: await getZonas(req.session.usuario.id), estados: ESTADOS, accion: `${req.baseUrl}/create` });
};

// GUARDAR
const store = async (req, res) => {
    try {
        const { mac_address, nombre, tipo_controlador, firmware_version, estado, ID_zona } = req.body;
        if (!mac_address || !nombre || !ID_zona) {
            req.flash('error', 'MAC, nombre y zona son obligatorios.');
            return res.redirect(`${req.baseUrl}/create`);
        }
        const mac = mac_address.trim().toUpperCase();
        if (!/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac)) {
            req.flash('error', 'La MAC debe tener el formato AA:BB:CC:DD:EE:FF.');
            return res.redirect(`${req.baseUrl}/create`);
        }
        const [existentes] = await db.query(
            'SELECT ID_dispositivo, nombre FROM dispositivo WHERE mac_address = ?',
            [mac]);
        if (existentes.length > 0) {
            req.flash('error', `Esta MAC ya está registrada como "${existentes[0].nombre}". Puedes editar ese dispositivo en lugar de crear otro.`);
            return res.redirect(`${req.baseUrl}/${existentes[0].ID_dispositivo}`);
        }
        const [zonaAccesible] = await db.query(`
            SELECT 1 FROM zona z JOIN usuario_invernadero ui
            ON ui.ID_invernadero = z.ID_invernadero
            WHERE z.ID_zona = ? AND ui.ID_usuario = ?`, [ID_zona, req.session.usuario.id]);
        if (zonaAccesible.length === 0) {
            req.flash('error', 'No tienes acceso a esa zona.');
            return res.redirect(`${req.baseUrl}/create`);
        }
        await db.query(
            `INSERT INTO dispositivo (mac_address, nombre, tipo_controlador, firmware_version, estado, ID_zona)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [mac, nombre, tipo_controlador || 'ESP32', firmware_version || 'v1.0.0', estado || 'Offline', ID_zona]);
        req.flash('success', 'Dispositivo registrado correctamente 📡');
    } catch (error) {
        console.error(error);
        req.flash('error', error.code === 'ER_DUP_ENTRY' ? 'Esa dirección MAC ya está registrada.' : 'Ocurrió un error al registrar el dispositivo.');
    }
    res.redirect(req.baseUrl);
};

// FORMULARIO EDITAR
const edit = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT d.* FROM dispositivo d
            JOIN zona z ON z.ID_zona = d.ID_zona
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE d.ID_dispositivo = ? AND ui.ID_usuario = ?`,
            [req.params.id, req.session.usuario.id]);
        if (rows.length === 0) return res.status(404).render('404');
        res.render('dispositivos/form', { item: rows[0], zonas: await getZonas(req.session.usuario.id), estados: ESTADOS, accion: `${req.baseUrl}/${req.params.id}/edit` });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// ACTUALIZAR
const update = async (req, res) => {
    try {
        const { mac_address, nombre, tipo_controlador, firmware_version, estado, ID_zona } = req.body;
        if (!await accesoDispositivo(req.params.id, req.session.usuario.id)) {
            req.flash('error', 'No tienes permiso para modificar este dispositivo.');
            return res.redirect(req.baseUrl);
        }
        await db.query(
            `UPDATE dispositivo SET mac_address = ?, nombre = ?, tipo_controlador = ?, firmware_version = ?, estado = ?, ID_zona = ?
             WHERE ID_dispositivo = ?`,
            [mac_address.toUpperCase(), nombre, tipo_controlador, firmware_version, estado, ID_zona, req.params.id]);
        req.flash('success', 'Dispositivo actualizado correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al actualizar el dispositivo.');
    }
    res.redirect(req.baseUrl);
};

// ELIMINAR
const destroy = async (req, res) => {
    try {
        if (!await accesoDispositivo(req.params.id, req.session.usuario.id)) {
            req.flash('error', 'No tienes permiso para eliminar este dispositivo.');
            return res.redirect(req.baseUrl);
        }
        await db.query('DELETE FROM dispositivo WHERE ID_dispositivo = ?', [req.params.id]);
        req.flash('success', 'Dispositivo eliminado correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se puede eliminar: el dispositivo tiene sensores o actuadores.');
    }
    res.redirect(req.baseUrl);
};

// AGREGAR SENSOR (+ su métrica)
const storeSensor = async (req, res) => {
    const { id } = req.params;
    try {
        if (!await accesoDispositivo(id, req.session.usuario.id)) {
            req.flash('error', 'No tienes permiso para modificar este dispositivo.');
            return res.redirect(req.baseUrl + '/' + id);
        }
        const { modelo, puerto_pin, numero_serie, nombre_variable, unidad_medida } = req.body;
        if (!modelo || !puerto_pin) {
            req.flash('error', 'Modelo y pin son obligatorios.');
            return res.redirect(`/dispositivos/${id}`);
        }
        const [r] = await db.query('INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES (?, ?, ?, ?)',
            [modelo, puerto_pin, numero_serie || null, id]);
        if (nombre_variable && unidad_medida) {
            await db.query('INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES (?, ?, ?)',
                [nombre_variable, unidad_medida, r.insertId]);
        }
        req.flash('success', 'Sensor agregado correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', error.code === 'ER_DUP_ENTRY' ? 'Ese pin ya está ocupado en este dispositivo.' : 'Ocurrió un error al agregar el sensor.');
    }
    res.redirect(`/dispositivos/${id}`);
};

// ELIMINAR SENSOR
const destroySensor = async (req, res) => {
    const { id, sensorId } = req.params;
    try {
        if (!await accesoDispositivo(id, req.session.usuario.id)) {
            req.flash('error', 'No tienes permiso para modificar este dispositivo.');
            return res.redirect(req.baseUrl + '/' + id);
        }
        await db.query('DELETE FROM sensor WHERE ID_sensor = ? AND ID_dispositivo = ?', [sensorId, id]);
        req.flash('success', 'Sensor eliminado.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se puede eliminar: el sensor tiene métricas con lecturas.');
    }
    res.redirect(`/dispositivos/${id}`);
};

module.exports = { index, show, create, store, edit, update, destroy, storeSensor, destroySensor };
