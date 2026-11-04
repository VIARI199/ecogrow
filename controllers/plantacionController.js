const db = require('../config/db');

const ESTADOS = ['Germinacion', 'Crecimiento', 'Cosecha', 'Finalizado'];

const opciones = async (usuarioId) => {
    const [especies] = await db.query('SELECT ID_especie, nombre_comun FROM especie ORDER BY nombre_comun');
    const [zonas] = await db.query(`
        SELECT z.ID_zona, CONCAT(i.nombre, ' · ', z.nombre_zona) AS nombre
        FROM zona z JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
        JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
        WHERE ui.ID_usuario = ? ORDER BY nombre`, [usuarioId]);
    return { especies, zonas, estados: ESTADOS };
};

// Muestra el mensaje del trigger de la BD ("La zona ya cuenta con una plantacion activa.")
const mensajeError = (error, base) => (error.sqlState === '45000' ? error.sqlMessage : base);

// LISTAR
const index = async (req, res) => {
    try {
        const [plantaciones] = await db.query(`
            SELECT p.*, e.nombre_comun, e.nombre_cientifico, z.nombre_zona, i.nombre AS invernadero
            FROM plantacion p
            JOIN especie e ON p.ID_especie = e.ID_especie
            JOIN zona z ON p.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            WHERE EXISTS (
                SELECT 1 FROM usuario_invernadero ui
                WHERE ui.ID_invernadero = i.ID_invernadero AND ui.ID_usuario = ?
            )
            ORDER BY p.fecha_siembra DESC`, [req.session.usuario.id]);
        res.render('plantaciones/index', { plantaciones, ...(await opciones(req.session.usuario.id)) });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

const show = async (req, res) => {
    try {
        const [plantaciones] = await db.query(`
            SELECT p.*, e.*, z.nombre_zona, i.nombre AS invernadero
            FROM plantacion p
            JOIN especie e ON p.ID_especie = e.ID_especie
            JOIN zona z ON p.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            WHERE p.ID_plantacion = ?
              AND EXISTS (SELECT 1 FROM usuario_invernadero ui
                          WHERE ui.ID_invernadero = i.ID_invernadero AND ui.ID_usuario = ?)`,
            [req.params.id, req.session.usuario.id]);
        if (plantaciones.length === 0) return res.status(404).render('404');
        const [mediciones] = await db.query(`
            SELECT m.nombre_variable, m.unidad_medida, l.valor, l.fecha_hora
            FROM metrica m
            JOIN sensor s ON m.ID_sensor = s.ID_sensor
            JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
            JOIN lectura_sensor l ON l.ID_metrica = m.ID_metrica
            WHERE d.ID_zona = ? AND l.ID_lectura = (
                SELECT MAX(l2.ID_lectura) FROM lectura_sensor l2 WHERE l2.ID_metrica = m.ID_metrica)
            ORDER BY m.nombre_variable`, [plantaciones[0].ID_zona]);
        res.render('plantaciones/show', { plantacion: plantaciones[0], mediciones });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// FORMULARIO CREAR
const create = async (req, res) => {
    res.render('plantaciones/form', { item: {}, ...(await opciones(req.session.usuario.id)), accion: `${req.baseUrl}/create` });
};

// GUARDAR
const store = async (req, res) => {
    try {
        const { fecha_siembra, estado, ID_especie, ID_zona } = req.body;
        if (!fecha_siembra || !ID_especie || !ID_zona) {
            req.flash('error', 'Fecha, especie y zona son obligatorias.');
            return res.redirect('/plantaciones/create');
        }
        const [acceso] = await db.query(`
            SELECT 1 FROM zona z
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE z.ID_zona = ? AND ui.ID_usuario = ?`, [ID_zona, req.session.usuario.id]);
        if (acceso.length === 0) {
            req.flash('error', 'No tienes acceso a esa zona.');
            return res.redirect(req.baseUrl + '/create');
        }
        await db.query('INSERT INTO plantacion (fecha_siembra, estado, ID_especie, ID_zona) VALUES (?, ?, ?, ?)',
            [fecha_siembra, estado || 'Crecimiento', ID_especie, ID_zona]);
        req.flash('success', 'Plantación registrada correctamente 🌱');
    } catch (error) {
        console.error(error);
        req.flash('error', mensajeError(error, 'Ocurrió un error al crear la plantación.'));
    }
    res.redirect(req.baseUrl || '/plantaciones');
};

// FORMULARIO EDITAR
const edit = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM plantacion WHERE ID_plantacion = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).render('404');
        res.render('plantaciones/form', { item: rows[0], ...(await opciones(req.session.usuario.id)), accion: `${req.baseUrl}/${req.params.id}/edit` });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// ACTUALIZAR
const update = async (req, res) => {
    try {
        const { fecha_siembra, estado, ID_especie, ID_zona } = req.body;
        const [acceso] = await db.query(`
            SELECT 1 FROM plantacion p
            JOIN zona z ON z.ID_zona = p.ID_zona
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE p.ID_plantacion = ? AND ui.ID_usuario = ?`, [req.params.id, req.session.usuario.id]);
        if (acceso.length === 0) {
            req.flash('error', 'No tienes permiso para modificar esta planta.');
            return res.redirect(req.baseUrl);
        }
        await db.query('UPDATE plantacion SET fecha_siembra = ?, estado = ?, ID_especie = ?, ID_zona = ? WHERE ID_plantacion = ?',
            [fecha_siembra, estado, ID_especie, ID_zona, req.params.id]);
        req.flash('success', 'Plantación actualizada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', mensajeError(error, 'Ocurrió un error al actualizar la plantación.'));
    }
    res.redirect(req.baseUrl || '/plantaciones');
};

// ELIMINAR
const destroy = async (req, res) => {
    try {
        const [acceso] = await db.query(`
            SELECT 1 FROM plantacion p
            JOIN zona z ON z.ID_zona = p.ID_zona
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE p.ID_plantacion = ? AND ui.ID_usuario = ?`, [req.params.id, req.session.usuario.id]);
        if (acceso.length === 0) {
            req.flash('error', 'No tienes permiso para eliminar esta planta.');
            return res.redirect(req.baseUrl);
        }
        await db.query('DELETE FROM plantacion WHERE ID_plantacion = ?', [req.params.id]);
        req.flash('success', 'Plantación eliminada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al eliminar la plantación.');
    }
    res.redirect(req.baseUrl || '/plantaciones');
};

module.exports = { index, show, create, store, edit, update, destroy };
