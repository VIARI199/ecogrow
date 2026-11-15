const MAC_ESP32_ACTUAL = 'B0:3F:D3:6F:52:F4';

const asignarInvernaderoESP32 = async (connection, usuarioId) => {
    const [invernaderos] = await connection.query(`
        SELECT i.ID_invernadero
        FROM dispositivo d
        JOIN zona z ON z.ID_zona = d.ID_zona
        JOIN invernadero i ON i.ID_invernadero = z.ID_invernadero
        WHERE d.mac_address = ?
        FOR UPDATE`, [MAC_ESP32_ACTUAL]);

    if (invernaderos.length === 0) {
        const error = new Error('El ESP32 actual no está registrado en el sistema.');
        error.code = 'ESP32_NO_CONFIGURADO';
        throw error;
    }

    await connection.query(
        `INSERT INTO usuario_invernadero (ID_usuario, ID_invernadero, rol_en_invernadero)
         VALUES (?, ?, 'Operador')`,
        [usuarioId, invernaderos[0].ID_invernadero]);
};

module.exports = asignarInvernaderoESP32;
