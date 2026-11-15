const db = require('../config/db');

const RANGOS = { '24h': 'INTERVAL 24 HOUR', '7d': 'INTERVAL 7 DAY', '30d': 'INTERVAL 30 DAY' };

const variableCanonica = (nombre) => {
    const normalizado = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').trim().toLowerCase();
    if (normalizado.startsWith('temperatura') || normalizado === 'temperature') return 'temperatura';
    if (normalizado.startsWith('humedad ambiental') || normalizado.startsWith('humedad ambiente') || normalizado === 'humidity') return 'humedad_ambiente';
    if (normalizado.startsWith('humedad del suelo') || normalizado.startsWith('humedad suelo') || normalizado === 'soil moisture') return 'humedad_suelo';
    if (['luz', 'ldr', 'iluminacion', 'light'].includes(normalizado)) return 'luz';
    if (normalizado.startsWith('calidad del aire') || normalizado.startsWith('calidad aire') || normalizado === 'co2') return 'calidad_aire';
    if (normalizado.startsWith('movimiento') || normalizado.startsWith('movement')) return 'movimiento';
    return normalizado;
};

// HISTORIAL DE MEDICIONES (tabla + gráfico)
const index = async (req, res) => {
    try {
        const rango = RANGOS[req.query.rango] ? req.query.rango : '24h';
        const [metricasFilas] = await db.query(`
            SELECT m.ID_metrica, m.nombre_variable, m.unidad_medida, z.ID_zona,
                   CONCAT(z.nombre_zona, ' · ', m.nombre_variable, ' (', m.unidad_medida, ')') AS nombre
            FROM metrica m
            JOIN sensor s ON m.ID_sensor = s.ID_sensor
            JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
            JOIN zona z ON d.ID_zona = z.ID_zona
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE ui.ID_usuario = ? ORDER BY nombre`, [req.session.usuario.id]);

        const metricasUnicas = new Map();
        for (const fila of metricasFilas) {
            const clave = `${fila.ID_zona}:${variableCanonica(fila.nombre_variable)}`;
            const anterior = metricasUnicas.get(clave);
            if (!anterior || Number(fila.ID_metrica) > Number(anterior.ID_metrica)) {
                metricasUnicas.set(clave, fila);
            }
        }
        const metricas = [...metricasUnicas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        const solicitada = Number(req.query.metrica);
        const metrica = metricas.some((fila) => Number(fila.ID_metrica) === solicitada)
            ? solicitada
            : metricas[0] && metricas[0].ID_metrica;
        let lecturas = [];
        let resumen = null;
        if (metrica) {
            [lecturas] = await db.query(
                `SELECT l.* FROM lectura_sensor l
                 JOIN metrica m ON m.ID_metrica = l.ID_metrica
                 JOIN sensor s ON s.ID_sensor = m.ID_sensor
                 JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
                 JOIN zona z ON z.ID_zona = d.ID_zona
                 JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
                 WHERE l.ID_metrica = ? AND ui.ID_usuario = ?
                 AND l.fecha_hora >= NOW() - ${RANGOS[rango]}
                 ORDER BY l.fecha_hora ASC`, [metrica, req.session.usuario.id]);
            [[resumen]] = await db.query(
                `SELECT ROUND(AVG(l.valor),2) AS promedio, MAX(l.valor) AS maximo, MIN(l.valor) AS minimo, COUNT(*) AS total,
                        (SELECT l2.valor FROM lectura_sensor l2
                         JOIN metrica m2 ON m2.ID_metrica = l2.ID_metrica
                         JOIN sensor s2 ON s2.ID_sensor = m2.ID_sensor
                         JOIN dispositivo d2 ON d2.ID_dispositivo = s2.ID_dispositivo
                         JOIN zona z2 ON z2.ID_zona = d2.ID_zona
                         JOIN usuario_invernadero ui2 ON ui2.ID_invernadero = z2.ID_invernadero
                         WHERE l2.ID_metrica = ? AND ui2.ID_usuario = ?
                           AND l2.fecha_hora >= NOW() - ${RANGOS[rango]}
                         ORDER BY l2.fecha_hora DESC LIMIT 1) AS ultimo,
                        (SELECT l3.valor FROM lectura_sensor l3
                         JOIN metrica m3 ON m3.ID_metrica = l3.ID_metrica
                         JOIN sensor s3 ON s3.ID_sensor = m3.ID_sensor
                         JOIN dispositivo d3 ON d3.ID_dispositivo = s3.ID_dispositivo
                         JOIN zona z3 ON z3.ID_zona = d3.ID_zona
                         JOIN usuario_invernadero ui3 ON ui3.ID_invernadero = z3.ID_invernadero
                         WHERE l3.ID_metrica = ? AND ui3.ID_usuario = ?
                           AND l3.fecha_hora >= NOW() - ${RANGOS[rango]}
                         ORDER BY l3.fecha_hora ASC LIMIT 1) AS primero
                 FROM lectura_sensor l
                 JOIN metrica m ON m.ID_metrica = l.ID_metrica
                 JOIN sensor s ON s.ID_sensor = m.ID_sensor
                 JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
                 JOIN zona z ON z.ID_zona = d.ID_zona
                 JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
                 WHERE l.ID_metrica = ? AND ui.ID_usuario = ? AND l.fecha_hora >= NOW() - ${RANGOS[rango]}`,
                [metrica, req.session.usuario.id, metrica, req.session.usuario.id, metrica, req.session.usuario.id]);
            resumen.tendencia = resumen.ultimo > resumen.primero ? 'subiendo' :
                resumen.ultimo < resumen.primero ? 'bajando' : 'estable';
        }
        res.render('lecturas/index', { metricas, metrica, rango, lecturas, resumen });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// ELIMINAR LECTURA
const destroy = async (req, res) => {
    try {
        await db.query(`DELETE l FROM lectura_sensor l
            JOIN metrica m ON m.ID_metrica = l.ID_metrica
            JOIN sensor s ON s.ID_sensor = m.ID_sensor
            JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
            JOIN zona z ON z.ID_zona = d.ID_zona
            JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
            WHERE l.ID_lectura = ? AND ui.ID_usuario = ?`,
            [req.params.id, req.session.usuario.id]);
        req.flash('success', 'Lectura eliminada.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se pudo eliminar la lectura.');
    }
    res.redirect(req.baseUrl);
};

module.exports = { index, destroy };
