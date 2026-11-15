-- Ejecutar una vez si las cuentas existentes perdieron acceso al invernadero
-- que contiene el ESP32 compartido.
USE ecogrow;

SET @invernadero_esp32 := (
    SELECT z.ID_invernadero
    FROM dispositivo d
    JOIN zona z ON z.ID_zona = d.ID_zona
    WHERE d.mac_address = 'B0:3F:D3:6F:52:F4'
    LIMIT 1
);

START TRANSACTION;

INSERT INTO usuario_invernadero (ID_usuario, ID_invernadero, rol_en_invernadero)
SELECT u.ID_usuario, @invernadero_esp32, 'Operador'
FROM usuario u
WHERE @invernadero_esp32 IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM usuario_invernadero ui
      WHERE ui.ID_usuario = u.ID_usuario
        AND ui.ID_invernadero = @invernadero_esp32
  );

SET @accesos_creados := ROW_COUNT();

COMMIT;

SELECT CASE
           WHEN @invernadero_esp32 IS NULL THEN
               'ERROR: no se encontro el ESP32 B0:3F:D3:6F:52:F4; no se asignaron accesos.'
           ELSE CONCAT('Accesos nuevos al invernadero ', @invernadero_esp32, ': ', @accesos_creados)
       END AS resultado;
