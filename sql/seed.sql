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

-- ESP32 real (MAC B0:3F:D3:6F:52:F4) en la Zona A. Los nombres de las métricas
-- son IDÉNTICOS a los que envía el firmware (ecogrow_esp32.ino).
INSERT INTO dispositivo (mac_address, nombre, tipo_controlador, estado, ID_zona) VALUES
('B0:3F:D3:6F:52:F4', 'ESP32 EcoGrow', 'ESP32', 'Offline', 1);

INSERT INTO sensor (modelo, puerto_pin, numero_serie, ID_dispositivo) VALUES
('DHT22', 'GPIO4', 'DHT-0001', 1),
('Humedad de suelo capacitivo', 'GPIO34', 'SOIL-0001', 1),
('LDR', 'GPIO analógico', 'LDR-0001', 1),
('MQ-135', 'GPIO32', 'MQ-0001', 1),
('HC-SR501', 'GPIO13', 'PIR-0001', 1);

INSERT INTO metrica (nombre_variable, unidad_medida, ID_sensor) VALUES
('Temperatura', '°C', 1), ('Humedad ambiental', '%', 1), ('Humedad del suelo', '%', 2),
('Luz', 'ADC', 3), ('Calidad del aire', 'índice', 4), ('Movimiento', '0/1', 5);

-- El nombre debe ser exactamente "Buzzer" (el firmware lo compara con ese texto)
INSERT INTO actuador (nombre, tipo, estado, ID_dispositivo) VALUES
('Buzzer', 'Buzzer', 'Apagado', 1);
