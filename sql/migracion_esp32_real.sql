-- =========================================================
-- ECOGROW - MIGRACIÓN: reemplazar los ESP32 de ejemplo por el real
-- Para una base de datos YA CREADA. Ejecutar una sola vez.
--   mysql -u root -p ecogrow < sql/migracion_esp32_real.sql
-- Borra los dispositivos AA:BB:CC:DD:EE:01 / :02 con TODO lo que cuelga de ellos
-- (sensores, métricas, lecturas, actuadores, reglas, acciones y alertas) y registra
-- B0:3F:D3:6F:52:F4 en la zona indicada.
-- =========================================================
USE ecogrow;

SET @zona := 1;   -- ID_zona donde estará la placa (SELECT * FROM zona;)

SET @viejos := (SELECT GROUP_CONCAT(ID_dispositivo) FROM dispositivo
                WHERE mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02'));

-- Alertas, acciones y reglas de lo viejo
DELETE a FROM alerta a
  JOIN lectura_sensor l ON a.ID_lectura = l.ID_lectura
  JOIN metrica m ON l.ID_metrica = m.ID_metrica
  JOIN sensor s ON m.ID_sensor = s.ID_sensor
  JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
  WHERE d.mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');
DELETE FROM alerta WHERE ID_lectura IS NULL AND mensaje LIKE 'El ESP32 Zona B%';

DELETE ac FROM accion_ejecutada ac
  JOIN actuador a ON ac.ID_actuador = a.ID_actuador
  JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
  WHERE d.mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');

DELETE r FROM regla_automatizacion r
  JOIN actuador a ON r.ID_actuador = a.ID_actuador
  JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
  WHERE d.mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');

-- Lecturas, métricas, sensores, actuadores y los dispositivos
DELETE l FROM lectura_sensor l
  JOIN metrica m ON l.ID_metrica = m.ID_metrica
  JOIN sensor s ON m.ID_sensor = s.ID_sensor
  JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
  WHERE d.mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');

DELETE m FROM metrica m
  JOIN sensor s ON m.ID_sensor = s.ID_sensor
  JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
  WHERE d.mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');

DELETE s FROM sensor s
  JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
  WHERE d.mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');

DELETE a FROM actuador a
  JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
  WHERE d.mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');

DELETE FROM dispositivo WHERE mac_address IN ('AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02');

-- ESP32 real (si ya lo habías registrado con el script anterior, bórralo antes:
--   DELETE ... WHERE mac_address = 'B0:3F:D3:6F:52:F4'  o simplemente no ejecutes esta parte)
INSERT INTO dispositivo (mac_address, nombre, tipo_controlador, estado, ID_zona)
VALUES ('B0:3F:D3:6F:52:F4', 'ESP32 EcoGrow', 'ESP32', 'Offline', @zona);
SET @disp := LAST_INSERT_ID();

INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES ('DHT22', 'GPIO4', 'DHT-0001', @disp);
SET @s := LAST_INSERT_ID();
INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES ('Temperatura', '°C', @s), ('Humedad ambiental', '%', @s);

INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES ('Humedad de suelo capacitivo', 'GPIO34', 'SOIL-0001', @disp);
SET @s := LAST_INSERT_ID();
INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES ('Humedad del suelo', '%', @s);

INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES ('LDR', 'GPIO analógico', 'LDR-0001', @disp);
SET @s := LAST_INSERT_ID();
INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES ('Luz', 'ADC', @s);

INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES ('MQ-135', 'GPIO32', 'MQ-0001', @disp);
SET @s := LAST_INSERT_ID();
INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES ('Calidad del aire', 'índice', @s);

INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES ('HC-SR501', 'GPIO13', 'PIR-0001', @disp);
SET @s := LAST_INSERT_ID();
INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES ('Movimiento', '0/1', @s);

INSERT INTO actuador (nombre, tipo, estado, ID_dispositivo) VALUES ('Buzzer', 'Buzzer', 'Apagado', @disp);

-- Verificación: debe listar solo la MAC nueva con sus 6 métricas
SELECT d.ID_dispositivo, d.mac_address, s.modelo, m.nombre_variable
FROM dispositivo d
JOIN sensor s ON s.ID_dispositivo = d.ID_dispositivo
JOIN metrica m ON m.ID_sensor = s.ID_sensor;
