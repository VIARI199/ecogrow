const db = require('../config/db');
const { generarContenido, mensajeError } = require('../config/gemini');

const CAMPOS = ['nombre_comun', 'nombre_cientifico', 'temp_min', 'temp_max',
    'humedad_suelo_min', 'humedad_suelo_max', 'luz_min_lux', 'luz_max_lux'];
const INSTRUCCIONES_COMPLETAR_ESPECIE = `Completa datos hortícolas orientativos para una especie vegetal cuyo nombre común entrega el usuario. Devuelve exclusivamente un objeto JSON con nombre_cientifico (nombre científico aceptado), temp_min y temp_max en grados Celsius, humedad_suelo_min y humedad_suelo_max como porcentajes enteros, y luz_min_lux y luz_max_lux como lux enteros. Usa rangos razonables para cultivo general, con mínimo menor que máximo y valores dentro de rangos físicamente posibles. No inventes otro nombre común.`;

const valores = (body) => CAMPOS.map((c) => body[c]);
const incompleto = (body) => CAMPOS.some((c) => body[c] === undefined || body[c] === '');

const completar = async (req, res) => {
    const nombreComun = typeof req.body.nombre_comun === 'string' ? req.body.nombre_comun.trim() : '';
    if (!nombreComun || nombreComun.length > 50) {
        return res.status(400).json({ error: 'Escribe un nombre de planta de hasta 50 caracteres.' });
    }

    try {
        const datos = await generarContenido(INSTRUCCIONES_COMPLETAR_ESPECIE, nombreComun, {
            type: 'OBJECT',
            properties: {
                nombre_cientifico: { type: 'STRING' },
                temp_min: { type: 'NUMBER' },
                temp_max: { type: 'NUMBER' },
                humedad_suelo_min: { type: 'INTEGER' },
                humedad_suelo_max: { type: 'INTEGER' },
                luz_min_lux: { type: 'INTEGER' },
                luz_max_lux: { type: 'INTEGER' }
            },
            required: ['nombre_cientifico', 'temp_min', 'temp_max', 'humedad_suelo_min',
                'humedad_suelo_max', 'luz_min_lux', 'luz_max_lux']
        });

        const numeros = ['temp_min', 'temp_max', 'humedad_suelo_min', 'humedad_suelo_max',
            'luz_min_lux', 'luz_max_lux'];
        const rangosValidos = typeof datos.nombre_cientifico === 'string'
            && datos.nombre_cientifico.trim().length > 0
            && numeros.every((campo) => typeof datos[campo] === 'number' && Number.isFinite(datos[campo]))
            && datos.temp_min >= -10 && datos.temp_max <= 60 && datos.temp_min < datos.temp_max
            && Number.isInteger(datos.humedad_suelo_min) && Number.isInteger(datos.humedad_suelo_max)
            && datos.humedad_suelo_min >= 0 && datos.humedad_suelo_max <= 100
            && datos.humedad_suelo_min < datos.humedad_suelo_max
            && Number.isInteger(datos.luz_min_lux) && Number.isInteger(datos.luz_max_lux)
            && datos.luz_min_lux >= 0 && datos.luz_max_lux <= 200000
            && datos.luz_min_lux < datos.luz_max_lux;
        if (!rangosValidos) {
            const error = new Error('Gemini devolvió valores fuera de los rangos aceptados.');
            error.code = 'GEMINI_INVALID_PLANT_DATA';
            throw error;
        }

        return res.json({
            nombre_comun: nombreComun,
            nombre_cientifico: datos.nombre_cientifico.trim(),
            temp_min: datos.temp_min,
            temp_max: datos.temp_max,
            humedad_suelo_min: datos.humedad_suelo_min,
            humedad_suelo_max: datos.humedad_suelo_max,
            luz_min_lux: datos.luz_min_lux,
            luz_max_lux: datos.luz_max_lux
        });
    } catch (error) {
        console.error('Error al completar datos de especie:', error.code || error.message,
            error.status ? `(HTTP ${error.status})` : '', error.providerMessage || '');
        const estado = error.code === 'GEMINI_NOT_CONFIGURED' || error.status === 429 || error.status === 503
            ? 503
            : 502;
        return res.status(estado).json({ error: mensajeError(error) });
    }
};

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

module.exports = { index, create, completar, store, edit, update, destroy };
