const db = require('../config/db');

const ESTADOS = ['Nueva', 'Reconocida', 'Resuelta', 'Descartada'];

// LISTAR (filtro opcional por estado)
const index = async (req, res) => {
    try {
        const filtro = ESTADOS.includes(req.query.estado) ? req.query.estado : null;
        const [alertas] = await db.query(
            `SELECT DISTINCT a.*
             FROM alerta a
             LEFT JOIN lectura_sensor l ON l.ID_lectura = a.ID_lectura
             LEFT JOIN metrica m ON m.ID_metrica = l.ID_metrica
             LEFT JOIN sensor s ON s.ID_sensor = m.ID_sensor
             LEFT JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
             LEFT JOIN zona z ON z.ID_zona = d.ID_zona
             LEFT JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
             WHERE ui.ID_usuario = ? ${filtro ? 'AND a.estado = ?' : ''}
             ORDER BY FIELD(a.nivel_urgencia,'Critica','Alta','Media','Baja'), a.fecha_hora DESC`,
            filtro ? [req.session.usuario.id, filtro] : [req.session.usuario.id]);
        res.render('alertas/index', { alertas, estados: ESTADOS, filtro, baseUrl: req.baseUrl });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error del servidor');
    }
};

// CAMBIAR ESTADO
const cambiarEstado = async (req, res) => {
    try {
        const { estado } = req.body;
        if (!ESTADOS.includes(estado)) {
            req.flash('error', 'Estado inválido.');
        } else {
            await db.query(`UPDATE alerta SET estado = ? WHERE ID_alerta = ?
                AND ID_alerta IN (
                    SELECT x.ID_alerta FROM (
                        SELECT a.ID_alerta FROM alerta a
                        JOIN lectura_sensor l ON l.ID_lectura = a.ID_lectura
                        JOIN metrica m ON m.ID_metrica = l.ID_metrica
                        JOIN sensor s ON s.ID_sensor = m.ID_sensor
                        JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
                        JOIN zona z ON z.ID_zona = d.ID_zona
                        JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
                        WHERE ui.ID_usuario = ?
                    ) x
                )`, [estado, req.params.id, req.session.usuario.id]);
            req.flash('success', `Alerta marcada como ${estado}.`);
        }
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al actualizar la alerta.');
    }
    res.redirect(req.baseUrl || '/alertas');
};

// ELIMINAR
const destroy = async (req, res) => {
    try {
        await db.query(`DELETE FROM alerta WHERE ID_alerta = ?
            AND ID_alerta IN (
                SELECT x.ID_alerta FROM (
                    SELECT a.ID_alerta FROM alerta a
                    JOIN lectura_sensor l ON l.ID_lectura = a.ID_lectura
                    JOIN metrica m ON m.ID_metrica = l.ID_metrica
                    JOIN sensor s ON s.ID_sensor = m.ID_sensor
                    JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
                    JOIN zona z ON z.ID_zona = d.ID_zona
                    JOIN usuario_invernadero ui ON ui.ID_invernadero = z.ID_invernadero
                    WHERE ui.ID_usuario = ?
                ) x
            )`, [req.params.id, req.session.usuario.id]);
        req.flash('success', 'Alerta eliminada.');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Ocurrió un error al eliminar la alerta.');
    }
    res.redirect(req.baseUrl || '/alertas');
};

module.exports = { index, cambiarEstado, destroy };
