-- Limpieza global de una sola vez. Conserva el ESP32, su zona/invernadero,
-- sus sensores, actuadores y lecturas. Elimina las plantaciones y los demas datos.
-- Primero crea el nuevo invernadero desde la aplicacion y asignale el ESP32.
-- Haz un respaldo antes de ejecutar. Cambia la MAC si corresponde.
USE ecogrow;

SET @mac_esp32_conservar := 'B0:3F:D3:6F:52:F4';

-- Si la MAC no existe, los IDs quedan en 0 y todas las eliminaciones quedan bloqueadas.
SELECT COALESCE(MAX(d.ID_dispositivo), 0),
       COALESCE(MAX(z.ID_zona), 0),
       COALESCE(MAX(z.ID_invernadero), 0)
INTO @dispositivo_conservar, @zona_conservar, @invernadero_conservar
FROM dispositivo d
JOIN zona z ON z.ID_zona = d.ID_zona
WHERE d.mac_address = @mac_esp32_conservar;

SELECT @mac_esp32_conservar AS MAC_a_conservar,
       @dispositivo_conservar AS ID_dispositivo,
       @zona_conservar AS ID_zona,
       @invernadero_conservar AS ID_invernadero,
       IF(@dispositivo_conservar = 0,
          'ERROR: no se encontro el ESP32; no se borraran datos',
          'ESP32 encontrado; se limpiaran los demas datos') AS verificacion;

-- Desactiva temporalmente el modo seguro de Workbench para permitir los DELETE
-- masivos. El valor original se restaura al final del script.
SET @sql_safe_updates_original := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

DELETE FROM alerta
WHERE @dispositivo_conservar > 0;

DELETE FROM accion_ejecutada
WHERE @dispositivo_conservar > 0;

DELETE FROM regla_automatizacion
WHERE @dispositivo_conservar > 0;

DELETE FROM plantacion
WHERE @dispositivo_conservar > 0;

DELETE l FROM lectura_sensor l
JOIN metrica m ON m.ID_metrica = l.ID_metrica
JOIN sensor s ON s.ID_sensor = m.ID_sensor
WHERE @dispositivo_conservar > 0
  AND s.ID_dispositivo <> @dispositivo_conservar;

DELETE m FROM metrica m
JOIN sensor s ON s.ID_sensor = m.ID_sensor
WHERE @dispositivo_conservar > 0
  AND s.ID_dispositivo <> @dispositivo_conservar;

DELETE FROM sensor
WHERE @dispositivo_conservar > 0
  AND ID_dispositivo <> @dispositivo_conservar;

DELETE FROM actuador
WHERE @dispositivo_conservar > 0
  AND ID_dispositivo <> @dispositivo_conservar;

DELETE FROM dispositivo
WHERE @dispositivo_conservar > 0
  AND ID_dispositivo <> @dispositivo_conservar;

DELETE FROM zona
WHERE @dispositivo_conservar > 0
  AND ID_zona <> @zona_conservar;

DELETE FROM invernadero
WHERE @dispositivo_conservar > 0
  AND ID_invernadero <> @invernadero_conservar;

COMMIT;

SET SQL_SAFE_UPDATES = @sql_safe_updates_original;

SELECT 'Limpieza finalizada' AS resultado,
       @mac_esp32_conservar AS MAC_conservada,
       @invernadero_conservar AS ID_invernadero_conservado;
