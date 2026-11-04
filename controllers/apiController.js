const db = require('../config/db');

// =====================================
// POST /api/lecturas  (lo llama el ESP32)
// Header:  x-device-key: <DEVICE_KEY del .env>
// Body JSON:
// { "mac": "AA:BB:CC:DD:EE:01",
//   "lecturas": { "temperatura": 24.5, "humedad_ambiente": 68, "humedad_suelo": 55, "luz": 8400 } }
// =====================================
const registrarLecturas = async (req, res) => {
    try {
        const { mac, lecturas } = req.body;
        if (!mac || !lecturas || typeof lecturas !== 'object') {
            return res.status(400).json({ ok: false, error: 'Faltan "mac" o "lecturas"' });
        }
        const [disp] = await db.query('SELECT ID_dispositivo FROM dispositivo WHERE mac_address = ?', [mac.toUpperCase()]);
        if (disp.length === 0) return res.status(404).json({ ok: false, error: 'Dispositivo no registrado' });
        const idDispositivo = disp[0].ID_dispositivo;

        const guardadas = [];
        for (const [variable, valor] of Object.entries(lecturas)) {
            const [met] = await db.query(`
                SELECT m.ID_metrica FROM metrica m JOIN sensor s ON m.ID_sensor = s.ID_sensor
                WHERE s.ID_dispositivo = ? AND m.nombre_variable = ?`, [idDispositivo, variable]);
            if (met.length === 0 || isNaN(Number(valor))) continue;
            const [r] = await db.query('INSERT INTO lectura_sensor (valor, ID_metrica) VALUES (?, ?)', [Number(valor), met[0].ID_metrica]);
            guardadas.push(variable);
            await revisarReglas(met[0].ID_metrica, Number(valor), r.insertId);
            await revisarUmbrales(variable, met[0].ID_metrica, Number(valor), r.insertId);
        }

        const [metricasEsperadas] = await db.query(`
            SELECT m.nombre_variable, s.modelo
            FROM metrica m
            JOIN sensor s ON s.ID_sensor = m.ID_sensor
            WHERE s.ID_dispositivo = ?`, [idDispositivo]);
        const recibidas = new Set(Object.keys(lecturas).map((variable) => variable.toLowerCase()));
        for (const metrica of metricasEsperadas) {
            if (recibidas.has(metrica.nombre_variable.toLowerCase())) continue;
            const tipo = 'Sensor desconectado';
            const [abiertas] = await db.query(`
                SELECT ID_alerta FROM alerta
                WHERE tipo_alerta = ? AND mensaje LIKE ? AND estado IN ('Nueva', 'Reconocida')
                LIMIT 1`, [tipo, `%${mac.toUpperCase()}%${metrica.nombre_variable}%`]);
            if (abiertas.length === 0) {
                await db.query(
                    `INSERT INTO alerta (tipo_alerta, mensaje, nivel_urgencia, estado)
                     VALUES (?, ?, 'Alta', 'Nueva')`,
                    [tipo, `El sensor ${metrica.modelo} (${metrica.nombre_variable}) del nodo ${mac.toUpperCase()} no envió datos.`]);
            }
        }

        await db.query("UPDATE dispositivo SET estado = 'Online', ultima_comunicacion = NOW() WHERE ID_dispositivo = ?", [idDispositivo]);
        res.json({ ok: true, guardadas });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: 'Error del servidor' });
    }
};

// Compara la lectura con las reglas de automatización:
// si se cumple, registra la acción (Pendiente) y una alerta
const revisarReglas = async (idMetrica, valor, idLectura) => {
    const [reglas] = await db.query('SELECT * FROM regla_automatizacion WHERE ID_metrica = ?', [idMetrica]);
    const cumple = {
        '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '=': (a, b) => a === b
    };
    for (const r of reglas) {
        if (!cumple[r.condicion_operador](valor, Number(r.valor_umbral))) continue;
        await db.query(
            `INSERT INTO accion_ejecutada (origen, descripcion, comando, valor_comando, ID_actuador, ID_lectura, ID_regla)
             VALUES ('Automático', ?, ?, ?, ?, ?, ?)`,
            [r.nombre_regla, r.comando, r.valor_comando, r.ID_actuador, idLectura, r.ID_regla]);
        await db.query("INSERT INTO alerta (tipo_alerta, mensaje, nivel_urgencia, ID_lectura) VALUES ('Regla', ?, 'Media', ?)",
            [`${r.nombre_regla}: valor ${valor} ${r.condicion_operador} ${r.valor_umbral}`, idLectura]);
    }
};

// Compara la lectura con los umbrales que fija el administrador y, si se sale del rango, crea una alerta
const revisarUmbrales = async (variable, idMetrica, valor, idLectura) => {
    const [rows] = await db.query('SELECT minimo, maximo FROM umbral WHERE variable = ?', [variable]);
    if (rows.length === 0) return;                       // esa variable no tiene umbral definido
    const minimo = Number(rows[0].minimo);
    const maximo = Number(rows[0].maximo);
    if (valor >= minimo && valor <= maximo) return;      // dentro del rango: todo en orden

    const baja = valor < minimo;
    const tipo = `${variable} ${baja ? 'baja' : 'alta'}`;

    // Si ya hay una alerta abierta igual para esta métrica no se repite
    // (el ESP32 envía datos cada pocos segundos y llenaría la lista de alertas)
    const [abiertas] = await db.query(
        `SELECT a.ID_alerta FROM alerta a JOIN lectura_sensor l ON a.ID_lectura = l.ID_lectura
         WHERE l.ID_metrica = ? AND a.tipo_alerta = ? AND a.estado IN ('Nueva','Reconocida') LIMIT 1`,
        [idMetrica, tipo]);
    if (abiertas.length > 0) return;

    // Es "Crítica" si se pasa por más del 20 % del ancho del rango permitido; si no, "Alta"
    const desvio = baja ? minimo - valor : valor - maximo;
    const nivel = desvio > (maximo - minimo) * 0.2 ? 'Critica' : 'Alta';
    await db.query('INSERT INTO alerta (tipo_alerta, mensaje, nivel_urgencia, ID_lectura) VALUES (?, ?, ?, ?)',
        [tipo, `${variable} fuera de rango: ${valor} (permitido ${minimo} a ${maximo}).`, nivel, idLectura]);
};

// GET /api/comandos/:mac -> el ESP32 consulta acciones pendientes (bomba, ventilador...)
const comandosPendientes = async (req, res) => {
    try {
        const [acciones] = await db.query(`
            SELECT a.ID_accion, a.comando, a.valor_comando, ac.nombre AS actuador
            FROM accion_ejecutada a
            JOIN actuador ac ON a.ID_actuador = ac.ID_actuador
            JOIN dispositivo d ON ac.ID_dispositivo = d.ID_dispositivo
            WHERE d.mac_address = ? AND a.estado_comando = 'Pendiente'`, [req.params.mac.toUpperCase()]);
        if (acciones.length) {
            await db.query("UPDATE accion_ejecutada SET estado_comando = 'Enviado', fecha_envio = NOW() WHERE ID_accion IN (?)",
                [acciones.map((a) => a.ID_accion)]);
        }
        res.json({ ok: true, acciones });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: 'Error del servidor' });
    }
};

module.exports = { registrarLecturas, comandosPendientes };
