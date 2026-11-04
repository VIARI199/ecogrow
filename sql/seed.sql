-- =========================================================
-- ECOGROW - DATOS DE EJEMPLO (ejecutar DESPUÉS de schema.sql)
-- Contraseña de ambos usuarios: EcoGrow123
-- =========================================================
USE ecogrow;

INSERT INTO rol (nombre_rol, descripcion) VALUES
('Administrador', 'Acceso total al sistema y gestión de usuarios'),
('Usuario', 'Monitorea sus invernaderos y plantaciones');

INSERT INTO usuario (nombre, correo, contrasena_hash, ID_rol) VALUES
('Administrador EcoGrow', 'admin@ecogrow.cl', '$2b$10$c939QDVU8z2GFdh4EHACguZc9ahmjoAjwsEY8h4/fsFSHnfkAvhdW', 1),
('Vicente', 'vicente@ecogrow.cl', '$2b$10$c939QDVU8z2GFdh4EHACguZc9ahmjoAjwsEY8h4/fsFSHnfkAvhdW', 2);

INSERT INTO invernadero (nombre, ubicacion, fecha_creacion, descripcion) VALUES
('Invernadero 1', 'Santiago, Chile', '2026-05-01', 'Invernadero principal con hortalizas'),
('Huerto Casa', 'Maipú, Santiago', '2026-06-10', 'Huerto exterior de hierbas aromáticas');

INSERT INTO usuario_invernadero (ID_usuario, ID_invernadero, rol_en_invernadero) VALUES
(1, 1, 'Propietario'), (1, 2, 'Propietario'), (2, 1, 'Operador'), (2, 2, 'Propietario');

INSERT INTO zona (nombre_zona, descripcion, ID_invernadero) VALUES
('Zona A', 'Tomates', 1), ('Zona B', 'Lechugas', 1), ('Zona C', 'Cilantro', 2);

INSERT INTO especie (nombre_comun, nombre_cientifico, temp_min, temp_max, humedad_suelo_min, humedad_suelo_max, luz_min_lux, luz_max_lux) VALUES
('Tomate', 'Solanum lycopersicum', 20, 27, 60, 80, 6000, 12000),
('Lechuga', 'Lactuca sativa', 15, 22, 60, 80, 4000, 9000),
('Cilantro', 'Coriandrum sativum', 17, 24, 55, 75, 4000, 8000);

INSERT INTO plantacion (fecha_siembra, estado, ID_especie, ID_zona) VALUES
('2026-06-14', 'Crecimiento', 1, 1), ('2026-07-02', 'Germinacion', 2, 2), ('2026-07-20', 'Crecimiento', 3, 3);

INSERT INTO dispositivo (mac_address, nombre, tipo_controlador, estado, ultima_comunicacion, ID_zona) VALUES
('AA:BB:CC:DD:EE:01', 'ESP32 Zona A', 'ESP32', 'Offline', NULL, 1),
('AA:BB:CC:DD:EE:02', 'ESP32 Zona B', 'ESP32', 'Offline', NULL, 2);

INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES
('DHT22', 'GPIO4', 'DHT-0001', 1),
('Humedad de suelo capacitivo', 'GPIO34', 'SOIL-0001', 1),
('BH1750', 'I2C-0x23', 'BH-0001', 1);

INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES
('temperatura', '°C', 1), ('humedad_ambiente', '%', 1), ('humedad_suelo', '%', 2), ('luz', 'lux', 3);

INSERT INTO actuador (nombre, tipo, estado, ID_dispositivo) VALUES
('Bomba de riego', 'Bomba', 'Apagado', 1), ('Ventilador', 'Ventilador', 'Apagado', 1);

INSERT INTO regla_automatizacion (nombre_regla, condicion_operador, valor_umbral, comando, tiempo_segundos_accion, ID_metrica, ID_actuador, ID_zona) VALUES
('Regar si el suelo está seco', '<', 45, 'Encender', 120, 3, 1, 1),
('Ventilar si hace calor', '>', 28, 'Encender', 300, 1, 2, 1);

INSERT INTO lectura_sensor (valor, fecha_hora, ID_metrica) VALUES
(23.5, NOW() - INTERVAL 3 HOUR, 1), (24.1, NOW() - INTERVAL 2 HOUR, 1), (25.0, NOW() - INTERVAL 1 HOUR, 1), (24.6, NOW(), 1),
(66, NOW() - INTERVAL 3 HOUR, 2), (68, NOW() - INTERVAL 2 HOUR, 2), (70, NOW() - INTERVAL 1 HOUR, 2), (69, NOW(), 2),
(72, NOW() - INTERVAL 3 HOUR, 3), (60, NOW() - INTERVAL 2 HOUR, 3), (50, NOW() - INTERVAL 1 HOUR, 3), (42, NOW(), 3),
(7800, NOW() - INTERVAL 3 HOUR, 4), (8600, NOW() - INTERVAL 2 HOUR, 4), (9100, NOW() - INTERVAL 1 HOUR, 4), (8400, NOW(), 4);

INSERT INTO alerta (tipo_alerta, mensaje, nivel_urgencia, estado, ID_lectura) VALUES
('Humedad de suelo', 'La humedad del suelo en Zona A bajó a 42%', 'Alta', 'Nueva', 12),
('Sistema', 'El ESP32 Zona B no envía datos', 'Media', 'Nueva', NULL);
