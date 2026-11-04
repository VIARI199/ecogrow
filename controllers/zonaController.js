const db = require('../config/db');

const getInvernaderos = async (usuarioId) => {
    const [rows] = await db.query(`
        SELECT i.ID_invernadero, i.nombre FROM invernadero i
        JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
        WHERE ui.ID_usuario = ? ORDER BY i.nombre`, [usuarioId]);
    return rows;
};

// LISTAR
const index = async (req, res) => {
    try {
        const [zonas] = await db.query(`
            SELECT z.*, i.nombre AS invernadero
            FROM zona z JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
            WHERE ui.ID_usuario = ?
            ORDER BY i.nombre, z.nombre_zona`, [req.session.usuario.id]);
        res.render('zonas/index', { zonas });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// FORMULARIO CREAR
const create = async (req, res) => {
    res.render('zonas/form', {
        item: { ID_invernadero: Number(req.query.invernadero) || null },
        invernaderos: await getInvernaderos(req.session.usuario.id), accion: `${req.baseUrl}/create`
    });
};

// GUARDAR
const store = async (req, res) => {
    try {
        const { nombre_zona, descripcion, ID_invernadero } = req.body;
        if (!nombre_zona || !ID_invernadero) {
            req.flash('error', 'Nombre e invernadero son obligatorios.');
            return res.redirect(`${req.baseUrl}/create`);
        }
        const [acceso] = await db.query(
            'SELECT 1 FROM usuario_invernadero WHERE ID_usuario = ? AND ID_invernadero = ?',
            [req.session.usuario.id, ID_invernadero]);
        if (acceso.length === 0) {
            req.flash('error', 'No tienes acceso a ese invernadero.');
            return res.redirect(`${req.baseUrl}/create`);
        }
        await db.query('INSERT INTO zona (nombre_zona, descripcion, ID_invernadero) VALUES (?, ?, ?)',
            [nombre_zona, descripcion || null, ID_invernadero]);
        req.flash('success', 'Zona creada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', error.code === 'ER_DUP_ENTRY'
            ? 'Ya existe una zona con ese nombre en el invernadero.' : 'Ocurrió un error al crear la zona.');
    }
    res.redirect(req.baseUrl);
};

// FORMULARIO EDITAR
const edit = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT z.* FROM zona z
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE z.ID_zona = ? AND ui.ID_usuario = ?`,
            [req.params.id, req.session.usuario.id]);
        if (rows.length === 0) return res.status(404).render('404');
        res.render('zonas/form', { item: rows[0], invernaderos: await getInvernaderos(req.session.usuario.id), accion: `${req.baseUrl}/${req.params.id}/edit` });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// ACTUALIZAR
const update = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_zona, descripcion, ID_invernadero } = req.body;
        if (!nombre_zona || !ID_invernadero) {
            req.flash('error', 'Nombre e invernadero son obligatorios.');
            return res.redirect(`/zonas/${id}/edit`);
        }
        await db.query('UPDATE zona SET nombre_zona = ?, descripcion = ?, ID_invernadero = ? WHERE ID_zona = ?',
            [nombre_zona, descripcion || null, ID_invernadero, id]);
        req.flash('success', 'Zona actualizada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al actualizar la zona.');
    }
    res.redirect(req.baseUrl);
};

// ELIMINAR
const destroy = async (req, res) => {
    try {
        await db.query('DELETE FROM zona WHERE ID_zona = ?', [req.params.id]);
        req.flash('success', 'Zona eliminada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se puede eliminar: la zona tiene plantaciones o dispositivos.');
    }
    res.redirect(req.baseUrl);
};

module.exports = { index, create, store, edit, update, destroy };
