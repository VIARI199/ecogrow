const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { correoValido } = require('./authController');

const registrarAuditoria = async (req, accion, descripcion) => {
    try {
        const admin = req.session.usuario;
        await db.query(
            'INSERT INTO auditoria (ID_usuario, admin_nombre, admin_correo, accion, descripcion) VALUES (?, ?, ?, ?, ?)',
            [admin.id, admin.nombre, admin.correo, accion, descripcion]);
    } catch (error) {
        console.error('No se pudo registrar la auditoría:', error);
    }
};

const detectarNodosSinComunicacion = async () => {
    const [nodos] = await db.query(`
        SELECT d.ID_dispositivo, d.nombre, d.ultima_comunicacion, i.nombre AS invernadero
        FROM dispositivo d
        JOIN zona z ON z.ID_zona = d.ID_zona
        JOIN invernadero i ON i.ID_invernadero = z.ID_invernadero
        WHERE d.ultima_comunicacion IS NULL
           OR d.ultima_comunicacion < NOW() - INTERVAL 90 SECOND`);
    for (const nodo of nodos) {
        await db.query(`
            UPDATE dispositivo
            SET estado = CASE WHEN estado = 'Mantenimiento' THEN estado ELSE 'Offline' END
            WHERE ID_dispositivo = ?`, [nodo.ID_dispositivo]);
        const [abiertas] = await db.query(`
            SELECT ID_alerta FROM alerta
            WHERE tipo_alerta = 'Nodo desconectado'
              AND mensaje LIKE ?
              AND estado IN ('Nueva', 'Reconocida')
            LIMIT 1`, [`%${nodo.nombre}%`]);
        if (abiertas.length === 0) {
            const detalle = nodo.ultima_comunicacion
                ? `Última comunicación: ${new Date(nodo.ultima_comunicacion).toLocaleString('es-CL')}.`
                : 'No existe comunicación registrada.';
            await db.query(
                `INSERT INTO alerta (tipo_alerta, mensaje, nivel_urgencia, estado)
                 VALUES ('Nodo desconectado', ?, 'Alta', 'Nueva')`,
                [`El nodo ${nodo.nombre} dejó de enviar datos en ${nodo.invernadero}. ${detalle}`]);
        }
    }
};

// PANEL ADMIN: resumen del sistema
const index = async (req, res) => {
    try {
        await detectarNodosSinComunicacion();
        const [[stats], [dispositivos], [acciones], [alertas]] = await Promise.all([
            db.query(`
            SELECT (SELECT COUNT(*) FROM usuario) AS usuarios,
                   (SELECT COUNT(*) FROM usuario WHERE estado = 'Activo') AS activos,
                   (SELECT COUNT(*) FROM dispositivo
                    WHERE estado = 'Online' AND ultima_comunicacion >= NOW() - INTERVAL 90 SECOND) AS online,
                   (SELECT COUNT(*) FROM dispositivo) AS dispositivos,
                   (SELECT COUNT(*) FROM sensor WHERE estado = 'Activo') AS sensores,
                   (SELECT COUNT(*) FROM alerta
                    WHERE nivel_urgencia = 'Critica' AND estado IN ('Nueva','Reconocida')) AS criticas`),
            db.query(`
            SELECT d.ID_dispositivo, d.nombre, d.mac_address, d.firmware_version, d.estado, d.ultima_comunicacion,
                   z.nombre_zona, i.nombre AS invernadero,
                   (d.estado = 'Online' AND d.ultima_comunicacion >= NOW() - INTERVAL 90 SECOND) AS enlace,
                   (SELECT GROUP_CONCAT(s.modelo SEPARATOR ', ') FROM sensor s
                    WHERE s.ID_dispositivo = d.ID_dispositivo) AS sensores,
                   (SELECT GROUP_CONCAT(a.nombre SEPARATOR ', ') FROM actuador a
                    WHERE a.ID_dispositivo = d.ID_dispositivo) AS actuadores
            FROM dispositivo d
            JOIN zona z ON d.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            ORDER BY d.ID_dispositivo`),
            db.query(`
            SELECT a.comando, ac.nombre AS actuador, a.origen, a.estado_comando, a.descripcion, a.fecha_creacion
            FROM accion_ejecutada a
            JOIN actuador ac ON a.ID_actuador = ac.ID_actuador
            ORDER BY a.fecha_creacion DESC, a.ID_accion DESC
            LIMIT 10`)
            ,
            db.query(`
            SELECT tipo_alerta, mensaje, nivel_urgencia, fecha_hora
            FROM alerta
            WHERE estado IN ('Nueva', 'Reconocida')
              AND tipo_alerta IN ('Nodo desconectado', 'Sensor desconectado')
            ORDER BY fecha_hora DESC
            LIMIT 8`)
        ]);
        res.render('admin/index', { stats, dispositivos, acciones, alertas });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// USUARIOS: listar
const usuarios = async (req, res) => {
    try {
        const [lista] = await db.query(`
            SELECT u.ID_usuario, u.nombre, u.correo, u.estado, u.fecha_registro, u.ID_rol, r.nombre_rol
            FROM usuario u JOIN rol r ON u.ID_rol = r.ID_rol ORDER BY u.ID_usuario`);
        const [roles] = await db.query('SELECT * FROM rol');
        res.render('admin/usuarios', { lista, roles });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// CREAR USUARIO
const storeUsuario = async (req, res) => {
    try {
        const { nombre, correo, contrasena, ID_rol } = req.body;
        const correoNormalizado = (correo || '').trim().toLowerCase();
        if (!nombre || !correoNormalizado || !contrasena || !ID_rol) {
            req.flash('error', 'Todos los campos son obligatorios.');
            return res.redirect('/admin/usuarios');
        }
        if (!correoValido(correoNormalizado)) {
            req.flash('error', 'Usa un correo de Gmail, Hotmail, Outlook, Yahoo o iCloud válido.');
            return res.redirect('/admin/usuarios');
        }
        const hash = await bcrypt.hash(contrasena, 10);
        await db.query('INSERT INTO usuario (nombre, correo, contrasena_hash, ID_rol) VALUES (?, ?, ?, ?)',
            [nombre, correoNormalizado, hash, ID_rol]);
        const [[rol]] = await db.query('SELECT nombre_rol FROM rol WHERE ID_rol = ?', [ID_rol]);
        await registrarAuditoria(req, 'Crear usuario', `Creó la cuenta de ${nombre} (${correoNormalizado}) con rol ${rol.nombre_rol}.`);
        req.flash('success', 'Usuario creado correctamente.');
    } catch (error) {
        console.error(error);
        req.flash('error', error.code === 'ER_DUP_ENTRY' ? 'Ese correo ya existe.' : 'Error al crear usuario.');
    }
    res.redirect('/admin/usuarios');
};

// CAMBIAR ROL
const updateUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const { ID_rol } = req.body;
        if (Number(id) === req.session.usuario.id) {
            req.flash('error', 'No puedes cambiar tu propio rol.');
            return res.redirect('/admin/usuarios');
        }
        const [[destino]] = await db.query(
            `SELECT u.nombre, u.correo, r.nombre_rol AS rol_actual,
                    (SELECT nombre_rol FROM rol WHERE ID_rol = ?) AS rol_nuevo
             FROM usuario u JOIN rol r ON u.ID_rol = r.ID_rol WHERE u.ID_usuario = ?`, [ID_rol, id]);
        await db.query('UPDATE usuario SET ID_rol = ? WHERE ID_usuario = ?', [ID_rol, id]);
        await registrarAuditoria(req, 'Cambiar rol',
            `Cambió el rol de ${destino.nombre} (${destino.correo}) de ${destino.rol_actual} a ${destino.rol_nuevo}.`);
        req.flash('success', 'Rol actualizado.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error al actualizar el rol.');
    }
    res.redirect('/admin/usuarios');
};

// SUSPENDER / REACTIVAR
const cambiarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        if (!['Activo', 'Inactivo'].includes(estado)) {
            req.flash('error', 'Estado inválido.');
        } else if (Number(id) === req.session.usuario.id) {
            req.flash('error', 'No puedes suspender tu propia cuenta.');
        } else {
            const [[destino]] = await db.query('SELECT nombre, correo FROM usuario WHERE ID_usuario = ?', [id]);
            await db.query("UPDATE usuario SET estado = ? WHERE ID_usuario = ? AND estado <> 'Baja'", [estado, id]);
            await registrarAuditoria(req, estado === 'Inactivo' ? 'Suspender cuenta' : 'Reactivar cuenta',
                `${estado === 'Inactivo' ? 'Suspendió' : 'Reactivó'} la cuenta de ${destino.nombre} (${destino.correo}).`);
            req.flash('success', estado === 'Inactivo' ? 'Cuenta suspendida.' : 'Cuenta reactivada.');
        }
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error al cambiar el estado.');
    }
    res.redirect('/admin/usuarios');
};

// DAR DE BAJA (no se borra la fila: así se conserva el historial)
const destroyUsuario = async (req, res) => {
    try {
        if (Number(req.params.id) === req.session.usuario.id) {
            req.flash('error', 'No puedes dar de baja tu propia cuenta.');
        } else {
            const [[destino]] = await db.query('SELECT nombre, correo FROM usuario WHERE ID_usuario = ?', [req.params.id]);
            await db.query("UPDATE usuario SET estado = 'Baja' WHERE ID_usuario = ?", [req.params.id]);
            await registrarAuditoria(req, 'Dar de baja', `Dio de baja la cuenta de ${destino.nombre} (${destino.correo}).`);
            req.flash('success', 'Cuenta dada de baja. Su historial se conserva.');
        }
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error al dar de baja el usuario.');
    }
    res.redirect('/admin/usuarios');
};

// AUDITORÍA: ver el historial (últimos 200 registros)
const auditoria = async (req, res) => {
    try {
        const [registros] = await db.query(
            'SELECT * FROM auditoria ORDER BY fecha_hora DESC, ID_auditoria DESC LIMIT 200');
        res.render('admin/auditoria', { registros });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// AUDITORÍA: descargar TODO el historial como CSV (se abre en Excel)
const celda = (valor) => {
    let texto = String(valor ?? '');
    const esNumero = /^-?\d+([.,]\d+)?$/.test(texto);   // un número como -2,5 no es una fórmula
    if (!esNumero && /^[=+\-@]/.test(texto)) texto = "'" + texto;   // evita que Excel ejecute fórmulas
    return `"${texto.replace(/"/g, '""')}"`;
};

const exportarAuditoria = async (req, res) => {
    try {
        const [filas] = await db.query(
            `SELECT fecha_hora, admin_nombre, admin_correo, accion, descripcion
             FROM auditoria ORDER BY fecha_hora DESC, ID_auditoria DESC`);
        const lineas = [['Fecha', 'Administrador', 'Correo', 'Acción', 'Descripción'].map(celda).join(';')];
        filas.forEach((f) => lineas.push([
            new Date(f.fecha_hora).toLocaleString('es-CL'), f.admin_nombre, f.admin_correo, f.accion, f.descripcion
        ].map(celda).join(';')));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="auditoria-ecogrow.csv"');
        res.send('\ufeff' + lineas.join('\r\n'));      // \ufeff = marca para que Excel lea bien las tildes
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// REPORTES: pantalla con los botones de descarga
const reportes = (req, res) => res.render('admin/reportes');

// Arma y envía un CSV (reutiliza "celda", que ya existe más arriba)
const enviarCsv = (res, archivo, encabezados, filas) => {
    const lineas = [encabezados.map(celda).join(';')];
    filas.forEach((fila) => lineas.push(fila.map(celda).join(';')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${archivo}"`);
    res.send('\ufeff' + lineas.join('\r\n'));
};

// Los períodos permitidos. Nunca se mete lo que llega por la URL directo en el SQL:
// se usa como "llave" para elegir uno de estos valores fijos y seguros.
const PERIODOS = {
    '24h': { sql: 'INTERVAL 24 HOUR', nombre: 'últimas 24 horas' },
    '7d': { sql: 'INTERVAL 7 DAY', nombre: 'últimos 7 días' },
    '30d': { sql: 'INTERVAL 30 DAY', nombre: 'últimos 30 días' }
};

// REPORTE: lecturas de los sensores
const reporteLecturas = async (req, res) => {
    try {
        const clave = PERIODOS[req.query.periodo] ? req.query.periodo : '24h';
        const periodo = PERIODOS[clave];
        const [filas] = await db.query(`
            SELECT l.fecha_hora, i.nombre AS invernadero, z.nombre_zona, d.nombre AS dispositivo,
                   m.nombre_variable, l.valor, m.unidad_medida
            FROM lectura_sensor l
            JOIN metrica m ON l.ID_metrica = m.ID_metrica
            JOIN sensor s ON m.ID_sensor = s.ID_sensor
            JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
            JOIN zona z ON d.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            WHERE l.fecha_hora >= NOW() - ${periodo.sql}
            ORDER BY l.fecha_hora DESC`);
        await registrarAuditoria(req, 'Exportar reporte', `Descargó las lecturas (${periodo.nombre}): ${filas.length} registros.`);
        enviarCsv(res, `lecturas-${clave}.csv`,
            ['Fecha', 'Invernadero', 'Zona', 'Dispositivo', 'Variable', 'Valor', 'Unidad'],
            filas.map((f) => [
                new Date(f.fecha_hora).toLocaleString('es-CL'), f.invernadero, f.nombre_zona, f.dispositivo,
                f.nombre_variable, String(f.valor).replace('.', ','), f.unidad_medida   // coma decimal para el Excel en español
            ]));
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// REPORTE: base de usuarios (nunca incluye contraseñas)
const reporteUsuarios = async (req, res) => {
    try {
        const [filas] = await db.query(`
            SELECT u.ID_usuario, u.nombre, u.correo, r.nombre_rol, u.estado, u.fecha_registro
            FROM usuario u JOIN rol r ON u.ID_rol = r.ID_rol ORDER BY u.ID_usuario`);
        await registrarAuditoria(req, 'Exportar reporte', `Descargó la base de usuarios: ${filas.length} cuentas.`);
        enviarCsv(res, 'usuarios-ecogrow.csv',
            ['ID', 'Nombre', 'Correo', 'Rol', 'Estado', 'Fecha de registro'],
            filas.map((f) => [f.ID_usuario, f.nombre, f.correo, f.nombre_rol, f.estado,
                new Date(f.fecha_registro).toLocaleString('es-CL')]));
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// AUTOMATIZACIÓN: pantalla con los umbrales (y, en la siguiente parte, los relés)
const automatizacion = async (req, res) => {
    try {
        const [umbrales] = await db.query('SELECT * FROM umbral');
        const [actuadores] = await db.query(`
            SELECT a.ID_actuador, a.nombre, a.tipo, a.estado, d.nombre AS dispositivo,
                   z.nombre_zona, i.nombre AS invernadero,
                   (d.estado = 'Online' AND d.ultima_comunicacion >= NOW() - INTERVAL 90 SECOND) AS enlace
            FROM actuador a
            JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
            JOIN zona z ON d.ID_zona = z.ID_zona
            JOIN invernadero i ON z.ID_invernadero = i.ID_invernadero
            ORDER BY i.nombre, z.nombre_zona, a.nombre`);
        res.render('admin/automatizacion', { umbrales, actuadores });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// UMBRALES: guardar los límites de temperatura y humedad de suelo
const guardarUmbrales = async (req, res) => {
    try {
        const campos = ['temp_min', 'temp_max', 'suelo_min', 'suelo_max'];
        if (campos.some((k) => req.body[k] === undefined || String(req.body[k]).trim() === '')) {
            req.flash('error', 'Completa los cuatro valores.');
            return res.redirect('/admin/automatizacion');
        }
        const [tMin, tMax, sMin, sMax] = campos.map((k) => Number(req.body[k]));
        if ([tMin, tMax, sMin, sMax].some(Number.isNaN)) {
            req.flash('error', 'Todos los valores deben ser números.');
            return res.redirect('/admin/automatizacion');
        }
        if (tMin > tMax || sMin > sMax) {
            req.flash('error', 'El mínimo no puede ser mayor que el máximo.');
            return res.redirect('/admin/automatizacion');
        }
        if (sMin < 0 || sMax > 100) {
            req.flash('error', 'La humedad de suelo debe estar entre 0 y 100 %.');
            return res.redirect('/admin/automatizacion');
        }

        // Valores de antes, para dejar en la auditoría qué cambió
        const [antes] = await db.query('SELECT variable, minimo, maximo FROM umbral');
        const previo = (v) => {
            const f = antes.find((a) => a.variable === v);
            return f ? `${Number(f.minimo)}–${Number(f.maximo)}` : 'sin definir';
        };
        const descripcion = `Temperatura: ${previo('Temperatura')} → ${tMin}–${tMax} °C; `
            + `Humedad del suelo: ${previo('Humedad del suelo')} → ${sMin}–${sMax} %.`;

        const guardar = (variable, minimo, maximo, unidad) => db.query(
            `INSERT INTO umbral (variable, minimo, maximo, unidad) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE minimo = VALUES(minimo), maximo = VALUES(maximo)`,
            [variable, minimo, maximo, unidad]);
        await guardar('Temperatura', tMin, tMax, '°C');
        await guardar('Humedad del suelo', sMin, sMax, '%');

        await registrarAuditoria(req, 'Cambiar umbrales', descripcion);
        req.flash('success', 'Umbrales guardados.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se pudieron guardar los umbrales.');
    }
    res.redirect('/admin/automatizacion');
};

// ACTUADORES: encender o apagar un relé a mano (con modo simulación si la placa no transmite)
const controlarActuador = async (req, res) => {
    try {
        const { id } = req.params;
        const { comando } = req.body;
        if (!['Encender', 'Apagar'].includes(comando)) {
            req.flash('error', 'Comando inválido.');
            return res.redirect('/admin/automatizacion');
        }
        const [rows] = await db.query(`
            SELECT a.ID_actuador, a.nombre, d.nombre AS dispositivo,
                   (d.estado = 'Online' AND d.ultima_comunicacion >= NOW() - INTERVAL 90 SECOND) AS enlace
            FROM actuador a JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
            WHERE a.ID_actuador = ?`, [id]);
        if (rows.length === 0) {
            req.flash('error', 'Actuador no encontrado.');
            return res.redirect('/admin/automatizacion');
        }
        const act = rows[0];
        const simulacion = !act.enlace;   // la placa no transmite: no se manda nada a ningún relé

        const descripcion = simulacion
            ? `[SIMULACIÓN] ${comando} «${act.nombre}»: no se envió, la placa ${act.dispositivo} no está transmitiendo.`
            : `Orden manual: ${comando} «${act.nombre}» (${act.dispositivo}).`;

        // En simulación la orden queda "Fallido" (no entregada), así el ESP32 nunca la recibe después.
        // En modo real queda "Pendiente": el ESP32 la recoge en su próxima consulta.
        await db.query(
            `INSERT INTO accion_ejecutada (origen, descripcion, comando, estado_comando, ID_actuador, ID_usuario)
             VALUES ('Manual', ?, ?, ?, ?, ?)`,
            [descripcion, comando, simulacion ? 'Fallido' : 'Pendiente', act.ID_actuador, req.session.usuario.id]);

        if (!simulacion) {
            await db.query('UPDATE actuador SET estado = ? WHERE ID_actuador = ?',
                [comando === 'Encender' ? 'Encendido' : 'Apagado', act.ID_actuador]);
        }

        await registrarAuditoria(req, 'Control de actuador',
            `${simulacion ? 'Simuló' : 'Ordenó'}: ${comando} «${act.nombre}» (${act.dispositivo}).`);
        req.flash('success', simulacion
            ? `Simulación: «${comando} ${act.nombre}» quedó registrada, pero no se envió porque la placa no está transmitiendo.`
            : `Orden enviada: ${comando} «${act.nombre}». El ESP32 la recibirá en su próxima consulta.`);
    } catch (error) {
        console.error(error);
        // sqlState 45000 = error lanzado por un trigger (ej. el admin no tiene acceso a ese invernadero)
        req.flash('error', error.sqlState === '45000' ? error.sqlMessage : 'No se pudo ejecutar la orden.');
    }
    res.redirect('/admin/automatizacion');
};

const ESTADOS_SENSOR = ['Activo', 'Mantenimiento', 'Inactivo'];

// CATÁLOGO: accesos a cultivos y espacios, y los sensores editables
const catalogo = async (req, res) => {
    try {
        const [sensores] = await db.query(`
            SELECT s.ID_sensor, s.modelo, s.puerto_pin, s.numero_serie, s.estado,
                   d.nombre AS dispositivo, z.nombre_zona,
                   (SELECT GROUP_CONCAT(CONCAT(m.nombre_variable, ' (', m.unidad_medida, ')') SEPARATOR ', ')
                    FROM metrica m WHERE m.ID_sensor = s.ID_sensor) AS metricas
            FROM sensor s
            JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
            JOIN zona z ON d.ID_zona = z.ID_zona
            ORDER BY d.nombre, s.puerto_pin`);
        res.render('admin/catalogo', { sensores });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// SENSORES: editar modelo, pin, número de serie y estado
const editarSensor = async (req, res) => {
    try {
        const { id } = req.params;
        const modelo = String(req.body.modelo || '').trim();
        const pin = String(req.body.puerto_pin || '').trim();
        const serie = String(req.body.numero_serie || '').trim();
        const { estado } = req.body;

        if (!modelo || !pin) {
            req.flash('error', 'El modelo y el pin son obligatorios.');
            return res.redirect('/admin/catalogo');
        }
        if (modelo.length > 40 || pin.length > 20 || serie.length > 50) {
            req.flash('error', 'Alguno de los textos es demasiado largo.');
            return res.redirect('/admin/catalogo');
        }
        if (!ESTADOS_SENSOR.includes(estado)) {
            req.flash('error', 'Estado inválido.');
            return res.redirect('/admin/catalogo');
        }

        const [rows] = await db.query(
            `SELECT s.*, d.nombre AS dispositivo FROM sensor s
             JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo WHERE s.ID_sensor = ?`, [id]);
        if (rows.length === 0) {
            req.flash('error', 'Sensor no encontrado.');
            return res.redirect('/admin/catalogo');
        }
        const antes = rows[0];

        await db.query(
            'UPDATE sensor SET modelo = ?, puerto_pin = ?, numero_serie = ?, estado = ? WHERE ID_sensor = ?',
            [modelo, pin, serie || null, estado, id]);

        // Solo se anota en la auditoría lo que realmente cambió
        const cambios = [];
        if (antes.modelo !== modelo) cambios.push(`modelo ${antes.modelo} → ${modelo}`);
        if (antes.puerto_pin !== pin) cambios.push(`pin ${antes.puerto_pin} → ${pin}`);
        if ((antes.numero_serie || '') !== serie) cambios.push(`serie ${antes.numero_serie || '—'} → ${serie || '—'}`);
        if (antes.estado !== estado) cambios.push(`estado ${antes.estado} → ${estado}`);

        if (cambios.length === 0) {
            req.flash('success', 'No había cambios que guardar.');
        } else {
            await registrarAuditoria(req, 'Editar sensor',
                `Sensor «${antes.modelo}» de ${antes.dispositivo}: ${cambios.join('; ')}.`.slice(0, 250));
            req.flash('success', 'Sensor actualizado.');
        }
    } catch (error) {
        console.error(error);
        req.flash('error', error.code === 'ER_DUP_ENTRY'
            ? 'Ese pin ya está ocupado en este dispositivo.' : 'No se pudo actualizar el sensor.');
    }
    res.redirect('/admin/catalogo');
};

const ROLES_INVERNADERO = ['Propietario', 'Operador', 'Supervisor', 'Lector'];

// ASIGNACIONES: pantalla con quién tiene acceso a qué invernadero
const asignaciones = async (req, res) => {
    try {
        const [filas] = await db.query(`
            SELECT ui.ID_usuario, ui.ID_invernadero, ui.rol_en_invernadero, ui.fecha_asignacion,
                   u.nombre, u.correo, u.estado, i.nombre AS invernadero
            FROM usuario_invernadero ui
            JOIN usuario u ON ui.ID_usuario = u.ID_usuario
            JOIN invernadero i ON ui.ID_invernadero = i.ID_invernadero
            ORDER BY i.nombre, u.nombre`);
        const [usuarios] = await db.query(
            "SELECT ID_usuario, nombre, correo FROM usuario WHERE estado <> 'Baja' ORDER BY nombre");
        const [invernaderos] = await db.query('SELECT ID_invernadero, nombre FROM invernadero ORDER BY nombre');
        res.render('admin/asignaciones', { filas, usuarios, invernaderos, roles: ROLES_INVERNADERO });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// Cuántos propietarios tiene un invernadero (siempre debe quedar al menos uno)
const contarPropietarios = async (idInvernadero) => {
    const [[r]] = await db.query(
        "SELECT COUNT(*) AS n FROM usuario_invernadero WHERE ID_invernadero = ? AND rol_en_invernadero = 'Propietario'",
        [idInvernadero]);
    return r.n;
};

// ASIGNAR: dar acceso a un invernadero, o cambiar el rol si la persona ya lo tenía
const asignarInvernadero = async (req, res) => {
    try {
        const { ID_usuario, ID_invernadero, rol } = req.body;
        if (!ID_usuario || !ID_invernadero || !ROLES_INVERNADERO.includes(rol)) {
            req.flash('error', 'Elige un usuario, un invernadero y un rol válido.');
            return res.redirect('/admin/asignaciones');
        }
        const [usuarios] = await db.query('SELECT nombre, correo, estado FROM usuario WHERE ID_usuario = ?', [ID_usuario]);
        const [invernaderos] = await db.query('SELECT nombre FROM invernadero WHERE ID_invernadero = ?', [ID_invernadero]);
        if (usuarios.length === 0 || invernaderos.length === 0) {
            req.flash('error', 'Usuario o invernadero no encontrado.');
            return res.redirect('/admin/asignaciones');
        }
        const usuario = usuarios[0];
        const invernadero = invernaderos[0];
        if (usuario.estado === 'Baja') {
            req.flash('error', 'No se puede asignar una cuenta dada de baja.');
            return res.redirect('/admin/asignaciones');
        }

        const [previa] = await db.query(
            'SELECT rol_en_invernadero FROM usuario_invernadero WHERE ID_usuario = ? AND ID_invernadero = ?',
            [ID_usuario, ID_invernadero]);
        const rolAnterior = previa.length ? previa[0].rol_en_invernadero : null;

        // No se puede dejar un invernadero sin propietario
        if (rolAnterior === 'Propietario' && rol !== 'Propietario' && (await contarPropietarios(ID_invernadero)) <= 1) {
            req.flash('error', 'Es el único propietario de ese invernadero. Nombra a otro propietario antes de cambiarle el rol.');
            return res.redirect('/admin/asignaciones');
        }

        await db.query(
            `INSERT INTO usuario_invernadero (ID_usuario, ID_invernadero, rol_en_invernadero) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE rol_en_invernadero = VALUES(rol_en_invernadero)`,
            [ID_usuario, ID_invernadero, rol]);

        if (rolAnterior === rol) {
            req.flash('success', 'No había cambios que guardar.');
        } else {
            await registrarAuditoria(req, rolAnterior ? 'Cambiar acceso' : 'Dar acceso',
                rolAnterior
                    ? `Cambió el rol de ${usuario.nombre} (${usuario.correo}) en «${invernadero.nombre}»: ${rolAnterior} → ${rol}.`
                    : `Dio acceso a ${usuario.nombre} (${usuario.correo}) al invernadero «${invernadero.nombre}» como ${rol}.`);
            req.flash('success', rolAnterior ? 'Rol actualizado.' : 'Acceso asignado.');
        }
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se pudo guardar la asignación.');
    }
    res.redirect('/admin/asignaciones');
};

// QUITAR: sacar a una persona de un invernadero
const quitarAsignacion = async (req, res) => {
    try {
        const { idUsuario, idInvernadero } = req.params;
        const [rows] = await db.query(
            `SELECT ui.rol_en_invernadero, u.nombre, u.correo, i.nombre AS invernadero
             FROM usuario_invernadero ui
             JOIN usuario u ON ui.ID_usuario = u.ID_usuario
             JOIN invernadero i ON ui.ID_invernadero = i.ID_invernadero
             WHERE ui.ID_usuario = ? AND ui.ID_invernadero = ?`, [idUsuario, idInvernadero]);
        if (rows.length === 0) {
            req.flash('error', 'Esa asignación no existe.');
            return res.redirect('/admin/asignaciones');
        }
        const a = rows[0];
        if (a.rol_en_invernadero === 'Propietario' && (await contarPropietarios(idInvernadero)) <= 1) {
            req.flash('error', 'No puedes quitar al único propietario del invernadero.');
            return res.redirect('/admin/asignaciones');
        }
        await db.query('DELETE FROM usuario_invernadero WHERE ID_usuario = ? AND ID_invernadero = ?', [idUsuario, idInvernadero]);
        await registrarAuditoria(req, 'Quitar acceso',
            `Quitó el acceso de ${a.nombre} (${a.correo}) al invernadero «${a.invernadero}» (era ${a.rol_en_invernadero}).`);
        req.flash('success', 'Acceso quitado.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se pudo quitar el acceso.');
    }
    res.redirect('/admin/asignaciones');
};

module.exports = { index, usuarios, storeUsuario, updateUsuario, cambiarEstado, destroyUsuario, auditoria, exportarAuditoria, reportes, reporteLecturas, reporteUsuarios, automatizacion, guardarUmbrales, controlarActuador, controlarActuador, catalogo, editarSensor, asignaciones, asignarInvernadero, quitarAsignacion };