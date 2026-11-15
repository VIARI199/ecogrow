const db = require('../config/db');

module.exports = async (req, res, next) => {
    res.locals.alertasNuevas = 0;
    res.locals.dispositivosOnline = 0;

    if (req.session.usuario) {
        try {
            const [[r]] = await db.query(`
                SELECT
                    (SELECT COUNT(*) FROM alerta WHERE estado = 'Nueva') AS alertas,
                    (SELECT COUNT(*) FROM dispositivo WHERE estado = 'Online' AND ultima_comunicacion >= NOW() - INTERVAL 5 MINUTE) AS online
            `);
            res.locals.alertasNuevas = r ? r.alertas : 0;
            res.locals.dispositivosOnline = r ? r.online : 0;
        } catch (error) {
            console.error('Error al obtener estadisticas de la barra superior:', error);
        }
    }
    next();
};