const db = require('../config/db');

const CAMPOS = ['nombre_comun', 'nombre_cientifico', 'temp_min', 'temp_max',
    'humedad_suelo_min', 'humedad_suelo_max', 'luz_min_lux', 'luz_max_lux'];

const valores = (body) => CAMPOS.map((c) => body[c]);
const incompleto = (body) => CAMPOS.some((c) => body[c] === undefined || body[c] === '');

// LISTAR
const index = async (req, res) => {
    try {
        const [especies] = await db.query('SELECT * FROM especie ORDER BY nombre_comun');
        res.render('especies/index', { especies });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// FORMULARIO CREAR
const create = (req, res) => res.render('especies/form', { item: {}, accion: '/especies/create' });

// GUARDAR
const store = async (req, res) => {
    try {
        if (incompleto(req.body)) {
            req.flash('error', 'Todos los campos son obligatorios.');
            return res.redirect('/especies/create');
        }
        await db.query(`INSERT INTO especie (${CAMPOS.join(', ')}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, valores(req.body));
        req.flash('success', 'Especie creada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', error.code === 'ER_DUP_ENTRY'
            ? 'Ese nombre científico ya existe.'
            : 'Revisa los rangos: el mínimo no puede ser mayor que el máximo.');
    }
    res.redirect('/especies');
};

// FORMULARIO EDITAR
const edit = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM especie WHERE ID_especie = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).render('404');
        res.render('especies/form', { item: rows[0], accion: `/especies/${req.params.id}/edit` });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// ACTUALIZAR
const update = async (req, res) => {
    try {
        const { id } = req.params;
        if (incompleto(req.body)) {
            req.flash('error', 'Todos los campos son obligatorios.');
            return res.redirect(`/especies/${id}/edit`);
        }
        await db.query(`UPDATE especie SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')} WHERE ID_especie = ?`,
            [...valores(req.body), id]);
        req.flash('success', 'Especie actualizada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al actualizar (revisa los rangos).');
    }
    res.redirect('/especies');
};

// ELIMINAR
const destroy = async (req, res) => {
    try {
        await db.query('DELETE FROM especie WHERE ID_especie = ?', [req.params.id]);
        req.flash('success', 'Especie eliminada correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se puede eliminar: hay plantaciones con esta especie.');
    }
    res.redirect('/especies');
};

module.exports = { index, create, store, edit, update, destroy };
