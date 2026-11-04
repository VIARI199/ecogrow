const db = require('../config/db');

const obtenerDatos = async (usuarioId, usuarioApp) => {
    const acceso = usuarioApp ? 'JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero AND ui.ID_usuario = ?' : '';
    const filtro = usuarioApp ? 'WHERE ui.ID_usuario = ?' : '';
    const params = usuarioApp ? [usuarioId] : [];
    const [ultimasResult, totalesResult, alertasResult, plantacionesResult] = await Promise.all([
        db.query(`
            SELECT m.ID_metrica,
                   CASE
                       WHEN LOWER(m.nombre_variable) IN ('temperatura', 'temperature') THEN 'temperatura'
                       WHEN LOWER(m.nombre_variable) IN ('humedad ambiental', 'humedad_ambiente', 'humedad ambiente') THEN 'humedad_ambiente'
                       WHEN LOWER(m.nombre_variable) IN ('humedad del suelo', 'humedad_suelo', 'humedad suelo') THEN 'humedad_suelo'
                       WHEN LOWER(m.nombre_variable) IN ('luz', 'iluminación', 'iluminacion') THEN 'luz'
                       WHEN LOWER(m.nombre_variable) IN ('calidad del aire', 'calidad_aire', 'co2', 'co₂') THEN 'co2'
                       ELSE LOWER(m.nombre_variable)
                   END AS nombre_variable,
                   m.unidad_medida,
                   l.valor, l.fecha_hora, z.nombre_zona, i.nombre AS invernadero
            FROM metrica m
            JOIN sensor s ON m.ID_sensor = s.ID_sensor
            JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
                AND d.estado = 'Online'
                AND d.ultima_comunicacion >= NOW() - INTERVAL 90 SECOND
            JOIN zona z ON d.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            ${acceso}
            JOIN lectura_sensor l ON l.ID_lectura = (
                SELECT ID_lectura FROM lectura_sensor WHERE ID_metrica = m.ID_metrica
                ORDER BY fecha_hora DESC LIMIT 1)
            ORDER BY z.nombre_zona, m.nombre_variable
        `, params),
        db.query(`
            SELECT COUNT(DISTINCT i.ID_invernadero) AS invernaderos,
                   COUNT(DISTINCT CASE WHEN p.estado <> 'Finalizado' THEN p.ID_plantacion END) AS plantaciones,
                   COUNT(DISTINCT CASE WHEN d.estado = 'Online' AND d.ultima_comunicacion >= NOW() - INTERVAL 90 SECOND THEN d.ID_dispositivo END) AS online,
                   COUNT(DISTINCT d.ID_dispositivo) AS dispositivos,
                   COUNT(DISTINCT CASE WHEN a.estado = 'Nueva' THEN a.ID_alerta END) AS alertas
            FROM invernadero i
            LEFT JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
            LEFT JOIN zona z ON z.ID_invernadero = i.ID_invernadero
            LEFT JOIN plantacion p ON p.ID_zona = z.ID_zona
            LEFT JOIN dispositivo d ON d.ID_zona = z.ID_zona
            LEFT JOIN metrica m ON m.ID_sensor IN (SELECT ID_sensor FROM sensor WHERE ID_dispositivo = d.ID_dispositivo)
            LEFT JOIN lectura_sensor l ON l.ID_metrica = m.ID_metrica
            LEFT JOIN alerta a ON a.ID_lectura = l.ID_lectura
            ${filtro}
        `, params),
        db.query(`
            SELECT DISTINCT a.*
            FROM alerta a
            LEFT JOIN lectura_sensor l ON l.ID_lectura = a.ID_lectura
            LEFT JOIN metrica m ON m.ID_metrica = l.ID_metrica
            LEFT JOIN sensor s ON s.ID_sensor = m.ID_sensor
            LEFT JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
            LEFT JOIN zona z ON z.ID_zona = d.ID_zona
            LEFT JOIN invernadero i ON i.ID_invernadero = z.ID_invernadero
            LEFT JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
            WHERE a.estado = 'Nueva' ${usuarioApp ? 'AND ui.ID_usuario = ?' : ''}
            ORDER BY a.fecha_hora DESC LIMIT 5
        `, usuarioApp ? [usuarioId] : [])
        ,
        db.query(`
            SELECT p.ID_plantacion, p.estado, e.nombre_comun, z.nombre_zona, i.nombre AS invernadero
            FROM plantacion p
            JOIN especie e ON p.ID_especie = e.ID_especie
            JOIN zona z ON p.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            LEFT JOIN usuario_invernadero ui ON ui.ID_invernadero = i.ID_invernadero
            WHERE p.estado <> 'Finalizado' ${usuarioApp ? 'AND ui.ID_usuario = ?' : ''}
            ORDER BY p.fecha_siembra DESC LIMIT 6`,
            usuarioApp ? [usuarioId] : [])
    ]);

    return {
        ultimas: ultimasResult[0],
        totales: totalesResult[0][0],
        alertas: alertasResult[0],
        plantaciones: plantacionesResult[0]
    };
};

// DASHBOARD: última lectura de cada métrica + resumen
const index = async (req, res) => {
    try {
        const datos = await obtenerDatos(req.session.usuario.id, req.baseUrl.startsWith('/app'));
        const variables = new Set(datos.ultimas.map((lectura) => lectura.nombre_variable));
        const criticas = datos.alertas.filter((alerta) =>
            alerta.nivel_urgencia === 'Critica' || alerta.nivel_urgencia === 'Alta').length;
        datos.estadoGeneral = criticas > 0 ? 'Atención requerida' : datos.alertas.length > 0 ? 'Precaución' : 'Todo óptimo';
        datos.estadoGeneralClase = criticas > 0 ? 'crit' : datos.alertas.length > 0 ? 'warn' : 'ok';
        datos.metricasDisponibles = variables;
        res.render('dashboard', datos);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

const datos = async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await obtenerDatos(req.session.usuario.id, req.baseUrl.startsWith('/app')));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudieron actualizar los datos del panel' });
    }
};

module.exports = { index, datos };
