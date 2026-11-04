const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto');
const db = require('../config/db');
const mailer = require('../config/mailer');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const DOMINIOS_CORREO_PERMITIDOS = new Set([
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com',
    'outlook.es', 'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com'
]);

const correoValido = (correo) => {
    const partes = correo.split('@');
    return partes.length === 2 &&
        /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(partes[0]) &&
        DOMINIOS_CORREO_PERMITIDOS.has(partes[1].toLowerCase());
};

const hashResetCode = (code) => {
    const secret = process.env.RESET_CODE_SECRET || process.env.SESSION_SECRET;
    if (!secret) throw new Error('Configura RESET_CODE_SECRET o SESSION_SECRET para recuperar contraseñas.');
    return crypto.createHmac('sha256', secret).update(code).digest('hex');
};

const renderResetForm = (res, correo, mensaje) => res.render('auth/restablecer-contrasena', {
    correo,
    mensaje
});

const iniciarSesionUsuario = (req, res, user) => {
    req.session.usuario = {
        id: user.ID_usuario,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.nombre_rol
    };
    req.flash('success', `Bienvenido, ${user.nombre} 🌱`);
    return res.redirect('/app');
};

// FORMULARIO LOGIN
const loginForm = (req, res) => {
    if (req.session.usuario) return res.redirect('/app');
    res.render('auth/login');
};

// FORMULARIO RECUPERAR CONTRASEÑA
const recuperarContrasenaForm = (req, res) => res.render('auth/olvide-contrasena');

// ENVIAR CÓDIGO DE RECUPERACIÓN
const solicitarCodigoRecuperacion = async (req, res) => {
    const correo = (req.body.correo || '').trim().toLowerCase();
    if (!correo) {
        req.flash('error', 'Ingresa tu correo electrónico.');
        return res.redirect('/olvide-contrasena');
    }

    try {
        const [usuarios] = await db.query(
            "SELECT ID_usuario FROM usuario WHERE correo = ? AND estado = 'Activo'",
            [correo]
        );
        const usuario = usuarios[0];

        if (usuario) {
            const [codigosRecientes] = await db.query(
                `SELECT ID_usuario FROM codigo_recuperacion
                 WHERE ID_usuario = ? AND creado_en > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
                [usuario.ID_usuario]
            );

            if (codigosRecientes.length === 0) {
                const codigo = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
                const codigoHash = hashResetCode(codigo);

                await db.query(
                    `INSERT INTO codigo_recuperacion (ID_usuario, codigo_hash, expira_en, intentos)
                     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0)
                     ON DUPLICATE KEY UPDATE
                         codigo_hash = VALUES(codigo_hash),
                         expira_en = VALUES(expira_en),
                         creado_en = NOW(),
                         intentos = 0`,
                    [usuario.ID_usuario, codigoHash]
                );

                try {
                    await mailer.sendMail({
                        to: correo,
                        subject: 'Código para recuperar tu contraseña - EcoGrow',
                        text: `Tu código para recuperar la contraseña de EcoGrow es ${codigo}. Vence en 10 minutos. Si no solicitaste este cambio, ignora este mensaje.`,
                        html: `<p>Tu código para recuperar la contraseña de EcoGrow es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${codigo}</p><p>Vence en 10 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>`
                    });
                } catch (error) {
                    await db.query(
                        'DELETE FROM codigo_recuperacion WHERE ID_usuario = ? AND codigo_hash = ?',
                        [usuario.ID_usuario, codigoHash]
                    );
                    throw error;
                }
            }
        }

        return renderResetForm(
            res,
            correo,
            'Si el correo corresponde a una cuenta activa, recibirás un código. Revisa también la carpeta de spam.'
        );
    } catch (error) {
        console.error('Error al enviar el código de recuperación:', error);
        req.flash('error', 'No se pudo enviar el código. Revisa la configuración del correo e inténtalo nuevamente.');
        return res.redirect('/olvide-contrasena');
    }
};

// VALIDAR EL CÓDIGO Y ACTUALIZAR LA CONTRASEÑA
const restablecerContrasena = async (req, res) => {
    const correo = (req.body.correo || '').trim().toLowerCase();
    const codigo = (req.body.codigo || '').trim();
    const { contrasena, confirmar } = req.body;

    if (!correo || !/^\d{6}$/.test(codigo)) {
        req.flash('error', 'Ingresa el correo y el código de 6 dígitos recibido.');
        return res.redirect('/olvide-contrasena');
    }
    if (!contrasena || contrasena.length < 6) {
        return renderResetForm(res, correo, 'La contraseña debe tener al menos 6 caracteres.');
    }
    if (contrasena !== confirmar) {
        return renderResetForm(res, correo, 'Las contraseñas no coinciden.');
    }

    let connection;
    let transaccionIniciada = false;
    try {
        const codigoHash = hashResetCode(codigo);
        connection = await db.getConnection();
        await connection.beginTransaction();
        transaccionIniciada = true;

        const [filas] = await connection.query(
            `SELECT cr.ID_usuario, cr.codigo_hash, cr.expira_en > NOW() AS vigente, cr.intentos
             FROM codigo_recuperacion cr
             JOIN usuario u ON u.ID_usuario = cr.ID_usuario
             WHERE u.correo = ? AND u.estado = 'Activo'
             FOR UPDATE`,
            [correo]
        );
        const registro = filas[0];
        const hashGuardado = registro && Buffer.from(registro.codigo_hash, 'hex');
        const hashRecibido = Buffer.from(codigoHash, 'hex');
        const codigoCoincide = hashGuardado &&
            hashGuardado.length === hashRecibido.length &&
            crypto.timingSafeEqual(hashGuardado, hashRecibido);

        if (!registro || registro.intentos >= 5 || !registro.vigente || !codigoCoincide) {
            if (registro && registro.intentos < 5) {
                await connection.query(
                    'UPDATE codigo_recuperacion SET intentos = intentos + 1 WHERE ID_usuario = ?',
                    [registro.ID_usuario]
                );
            }
            await connection.commit();
            transaccionIniciada = false;
            return renderResetForm(res, correo, 'El código es inválido o venció. Solicita uno nuevo e inténtalo otra vez.');
        }

        const contrasenaHash = await bcrypt.hash(contrasena, 10);
        await connection.query(
            'UPDATE usuario SET contrasena_hash = ? WHERE ID_usuario = ?',
            [contrasenaHash, registro.ID_usuario]
        );
        await connection.query('DELETE FROM codigo_recuperacion WHERE ID_usuario = ?', [registro.ID_usuario]);
        await connection.commit();
        transaccionIniciada = false;

        req.flash('success', 'Contraseña actualizada. Ya puedes iniciar sesión.');
        return res.redirect('/login');
    } catch (error) {
        if (connection && transaccionIniciada) await connection.rollback();
        console.error('Error al restablecer la contraseña:', error);
        req.flash('error', 'No se pudo actualizar la contraseña. Inténtalo nuevamente.');
        return res.redirect('/olvide-contrasena');
    } finally {
        if (connection) connection.release();
    }
};

// INICIAR SESIÓN
const login = async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        if (!correo || !contrasena) {
            req.flash('error', 'Ingresa tu correo y contraseña.');
            return res.redirect('/login');
        }
        const [rows] = await db.query(
            `SELECT u.*, r.nombre_rol FROM usuario u
             JOIN rol r ON u.ID_rol = r.ID_rol WHERE u.correo = ?`, [correo]);
        const user = rows[0];
        if (!user || !(await bcrypt.compare(contrasena, user.contrasena_hash))) {
            req.flash('error', 'Correo o contraseña incorrectos.');
            return res.redirect('/login');
        }
        if (user.estado !== 'Activo') {
            req.flash('error', 'Tu cuenta está inactiva. Contacta al administrador.');
            return res.redirect('/login');
        }
        return iniciarSesionUsuario(req, res, user);
    } catch (error) {
        console.error(error);
        req.flash('error', 'Error del servidor al iniciar sesión.');
        res.redirect('/login');
    }
};

// FORMULARIO REGISTRO
const registroForm = (req, res) => res.render('auth/registro');

// GUARDAR USUARIO NUEVO
const registro = async (req, res) => {
    try {
        const { nombre, correo, contrasena, confirmar } = req.body;
        const correoNormalizado = (correo || '').trim().toLowerCase();
        if (!nombre || !correoNormalizado || !contrasena) {
            req.flash('error', 'Todos los campos son obligatorios.');
            return res.redirect('/registro');
        }
        if (!correoValido(correoNormalizado)) {
            req.flash('error', 'Usa un correo de Gmail, Hotmail, Outlook, Yahoo o iCloud válido.');
            return res.redirect('/registro');
        }
        if (contrasena.length < 6) {
            req.flash('error', 'La contraseña debe tener al menos 6 caracteres.');
            return res.redirect('/registro');
        }
        if (contrasena !== confirmar) {
            req.flash('error', 'Las contraseñas no coinciden.');
            return res.redirect('/registro');
        }
        const [existe] = await db.query(
            'SELECT ID_usuario FROM usuario WHERE correo = ?',
            [correoNormalizado]
        );
        if (existe.length > 0) {
            req.flash('error', 'Ese correo ya está registrado.');
            return res.redirect('/registro');
        }
        const [roles] = await db.query("SELECT ID_rol FROM rol WHERE nombre_rol = 'Usuario'");
        const hash = await bcrypt.hash(contrasena, 10);
        await db.query('INSERT INTO usuario (nombre, correo, contrasena_hash, ID_rol) VALUES (?, ?, ?, ?)',
            [nombre, correoNormalizado, hash, roles[0].ID_rol]);
        req.flash('success', 'Cuenta creada. Ya puedes iniciar sesión.');
        res.redirect('/login');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al crear la cuenta.');
        res.redirect('/registro');
    }
};

// INICIAR SESIÓN CON GOOGLE
// El botón de Google postea aquí un campo "credential" (el id_token).
const googleAuth = async (req, res) => {
    try {
        const { credential } = req.body;
        if (!credential) {
            req.flash('error', 'No se recibió la credencial de Google.');
            return res.redirect('/login');
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            req.flash('error', 'Token de Google inválido.');
            return res.redirect('/login');
        }
        const { sub: googleId, email: correo, name: nombre } = payload;

        const [rows] = await db.query(
            `SELECT u.*, r.nombre_rol FROM usuario u
             JOIN rol r ON u.ID_rol = r.ID_rol
             WHERE u.correo = ? OR u.google_id = ?`, [correo, googleId]);
        let user = rows[0];

        if (!user) {
            // Primera vez que inicia sesión: se crea como "Usuario"
            const [roles] = await db.query("SELECT ID_rol FROM rol WHERE nombre_rol = 'Usuario'");
            const [result] = await db.query(
                'INSERT INTO usuario (nombre, correo, google_id, ID_rol) VALUES (?, ?, ?, ?)',
                [nombre, correo, googleId, roles[0].ID_rol]);
            const [nuevo] = await db.query(
                `SELECT u.*, r.nombre_rol FROM usuario u
                 JOIN rol r ON u.ID_rol = r.ID_rol WHERE u.ID_usuario = ?`, [result.insertId]);
            user = nuevo[0];
        }

        if (user.estado !== 'Activo') {
            req.flash('error', 'Tu cuenta está inactiva. Contacta al administrador.');
            return res.redirect('/login');
        }

        if (!user.google_id) {
            await db.query('UPDATE usuario SET google_id = ? WHERE ID_usuario = ?', [googleId, user.ID_usuario]);
        }
        return iniciarSesionUsuario(req, res, user);
    } catch (error) {
        console.error(error);
        req.flash('error', 'No se pudo iniciar sesión con Google.');
        res.redirect('/login');
    }
};

// CERRAR SESIÓN
const logout = (req, res) => req.session.destroy(() => res.redirect('/login'));

module.exports = {
    loginForm,
    login,
    recuperarContrasenaForm,
    solicitarCodigoRecuperacion,
    restablecerContrasena,
    registroForm,
    registro,
    googleAuth,
    logout,
    correoValido
};
