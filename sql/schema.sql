-- =========================================================
-- ECOGROW - BASE DE DATOS COMPLETA (ETAPAS 3 Y 4)
-- =========================================================
CREATE DATABASE ecogrow;
USE ecogrow;

-- =========================================================
-- 1. ROLES Y USUARIOS
-- =========================================================
CREATE TABLE rol (
    ID_rol INT AUTO_INCREMENT PRIMARY KEY,
    nombre_rol VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(200) NOT NULL
);

CREATE TABLE usuario (
    ID_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(70) NOT NULL,
    correo VARCHAR(100) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NULL,
    google_id VARCHAR(255) NULL UNIQUE,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    ID_rol INT NOT NULL,
    estado ENUM('Activo','Inactivo','Baja') NOT NULL DEFAULT 'Activo',
    CONSTRAINT FK_usuario_rol FOREIGN KEY (ID_rol) REFERENCES rol(ID_rol) ON DELETE RESTRICT
);

CREATE TABLE codigo_recuperacion (
    ID_usuario INT PRIMARY KEY,
    codigo_hash CHAR(64) NOT NULL,
    expira_en DATETIME NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT FK_codigo_recuperacion_usuario
        FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
);

-- =========================================================
-- 2. INVERNADEROS Y ZONAS
-- =========================================================
CREATE TABLE invernadero (
    ID_invernadero INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    ubicacion VARCHAR(100) NOT NULL,
    fecha_creacion DATE NOT NULL,
    descripcion TEXT,
    estado ENUM('Activo','En mantenimiento','Inactivo') NOT NULL DEFAULT 'Activo'
);

CREATE TABLE usuario_invernadero (
    ID_usuario INT NOT NULL,
    ID_invernadero INT NOT NULL,
    rol_en_invernadero ENUM('Propietario','Operador','Supervisor','Lector') NOT NULL DEFAULT 'Operador',
    fecha_asignacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ID_usuario, ID_invernadero),
    CONSTRAINT FK_usrinv_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE,
    CONSTRAINT FK_usrinv_invernadero FOREIGN KEY (ID_invernadero) REFERENCES invernadero(ID_invernadero) ON DELETE CASCADE
);

CREATE TABLE zona (
    ID_zona INT AUTO_INCREMENT PRIMARY KEY,
    nombre_zona VARCHAR(50) NOT NULL,
    descripcion VARCHAR(150),
    ID_invernadero INT NOT NULL,
    CONSTRAINT FK_zona_invernadero FOREIGN KEY (ID_invernadero) REFERENCES invernadero(ID_invernadero) ON DELETE RESTRICT,
    CONSTRAINT UQ_zona_nombre_invernadero UNIQUE (ID_invernadero, nombre_zona)
);

-- =========================================================
-- 3. ESPECIES Y PLANTACIONES
-- =========================================================
CREATE TABLE especie (
    ID_especie INT AUTO_INCREMENT PRIMARY KEY,
    nombre_comun VARCHAR(50) NOT NULL,
    nombre_cientifico VARCHAR(80) NOT NULL UNIQUE,
    temp_min DECIMAL(4,1) NOT NULL,
    temp_max DECIMAL(4,1) NOT NULL,
    humedad_suelo_min INT NOT NULL,
    humedad_suelo_max INT NOT NULL,
    luz_min_lux INT NOT NULL,
    luz_max_lux INT NOT NULL,
    CONSTRAINT CHK_temp CHECK (temp_min <= temp_max),
    CONSTRAINT CHK_humedad_suelo CHECK (humedad_suelo_min >= 0 AND humedad_suelo_max <= 100 AND humedad_suelo_min <= humedad_suelo_max),
    CONSTRAINT CHK_luz CHECK (luz_min_lux >= 0 AND luz_min_lux <= luz_max_lux)
);

CREATE TABLE plantacion (
    ID_plantacion INT AUTO_INCREMENT PRIMARY KEY,
    fecha_siembra DATE NOT NULL,
    estado ENUM('Germinacion','Crecimiento','Cosecha','Finalizado') NOT NULL DEFAULT 'Crecimiento',
    ID_especie INT NOT NULL,
    ID_zona INT NOT NULL,
    CONSTRAINT FK_plantacion_especie FOREIGN KEY (ID_especie) REFERENCES especie(ID_especie) ON DELETE RESTRICT,
    CONSTRAINT FK_plantacion_zona FOREIGN KEY (ID_zona) REFERENCES zona(ID_zona) ON DELETE RESTRICT
);

-- =========================================================
-- 4. DISPOSITIVOS, SENSORES Y ACTUADORES
-- =========================================================
CREATE TABLE dispositivo (
    ID_dispositivo INT AUTO_INCREMENT PRIMARY KEY,
    mac_address VARCHAR(17) NOT NULL UNIQUE,
    nombre VARCHAR(50) NOT NULL,
    tipo_controlador VARCHAR(30) NOT NULL DEFAULT 'ESP32',
    firmware_version VARCHAR(20) DEFAULT 'v1.0.0',
    estado ENUM('Online','Offline','Mantenimiento') NOT NULL DEFAULT 'Offline',
    ultima_comunicacion DATETIME NULL,
    ID_zona INT NOT NULL,
    CONSTRAINT FK_dispositivo_zona FOREIGN KEY (ID_zona) REFERENCES zona(ID_zona) ON DELETE RESTRICT
);

CREATE TABLE sensor (
    ID_sensor INT AUTO_INCREMENT PRIMARY KEY,
    modelo VARCHAR(40) NOT NULL,
    puerto_pin VARCHAR(20) NOT NULL,
    numero_serie VARCHAR(50),
    estado ENUM('Activo','Mantenimiento','Inactivo') NOT NULL DEFAULT 'Activo',
    ID_dispositivo INT NOT NULL,
    CONSTRAINT FK_sensor_dispositivo FOREIGN KEY (ID_dispositivo) REFERENCES dispositivo(ID_dispositivo) ON DELETE RESTRICT,
    CONSTRAINT UQ_sensor_dispositivo_puerto UNIQUE (ID_dispositivo, puerto_pin)
);

CREATE TABLE metrica (
    ID_metrica INT AUTO_INCREMENT PRIMARY KEY,
    nombre_variable VARCHAR(40) NOT NULL,
    unidad_medida VARCHAR(20) NOT NULL,
    ID_sensor INT NOT NULL,
    CONSTRAINT FK_metrica_sensor FOREIGN KEY (ID_sensor) REFERENCES sensor(ID_sensor) ON DELETE RESTRICT,
    CONSTRAINT UQ_metrica_sensor_variable UNIQUE (ID_sensor, nombre_variable)
);

CREATE TABLE actuador (
    ID_actuador INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    estado ENUM('Encendido','Apagado') NOT NULL DEFAULT 'Apagado',
    ID_dispositivo INT NOT NULL,
    CONSTRAINT FK_actuador_dispositivo FOREIGN KEY (ID_dispositivo) REFERENCES dispositivo(ID_dispositivo) ON DELETE RESTRICT
);

-- =========================================================
-- 5. TELEMETRÍA
-- =========================================================
CREATE TABLE lectura_sensor (
    ID_lectura BIGINT AUTO_INCREMENT PRIMARY KEY,
    valor DECIMAL(10,2) NOT NULL,
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    ID_metrica INT NOT NULL,
    CONSTRAINT FK_lectura_metrica FOREIGN KEY (ID_metrica) REFERENCES metrica(ID_metrica) ON DELETE RESTRICT,
    INDEX idx_metrica_fecha (ID_metrica, fecha_hora)
);

-- =========================================================
-- 6. REGLAS DE AUTOMATIZACIÓN
-- =========================================================
CREATE TABLE regla_automatizacion (
    ID_regla INT AUTO_INCREMENT PRIMARY KEY,
    nombre_regla VARCHAR(80) NOT NULL,
    condicion_operador ENUM('<','>','<=','>=','=') NOT NULL,
    valor_umbral DECIMAL(10,2) NOT NULL,
    comando ENUM('Encender','Apagar','Abrir','Cerrar','Establecer_Intensidad') NOT NULL,
    valor_comando DECIMAL(5,2),
    tiempo_segundos_accion INT NOT NULL DEFAULT 300,
    ID_metrica INT NOT NULL,
    ID_actuador INT NOT NULL,
    ID_zona INT NOT NULL,
    CONSTRAINT FK_regla_metrica FOREIGN KEY (ID_metrica) REFERENCES metrica(ID_metrica) ON DELETE RESTRICT,
    CONSTRAINT FK_regla_actuador FOREIGN KEY (ID_actuador) REFERENCES actuador(ID_actuador) ON DELETE RESTRICT,
    CONSTRAINT FK_regla_zona FOREIGN KEY (ID_zona) REFERENCES zona(ID_zona) ON DELETE RESTRICT,
    CONSTRAINT UQ_regla UNIQUE (ID_metrica, ID_actuador, ID_zona, condicion_operador),
    CONSTRAINT CHK_tiempo_accion CHECK (tiempo_segundos_accion > 0)
);

-- =========================================================
-- 7. ALERTAS
-- =========================================================
CREATE TABLE alerta (
    ID_alerta INT AUTO_INCREMENT PRIMARY KEY,
    tipo_alerta VARCHAR(40) NOT NULL,
    mensaje VARCHAR(200) NOT NULL,
    nivel_urgencia ENUM('Baja','Media','Alta','Critica') NOT NULL,
    fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('Nueva','Reconocida','Resuelta','Descartada') NOT NULL DEFAULT 'Nueva',
    ID_lectura BIGINT NULL,
    CONSTRAINT FK_alerta_lectura FOREIGN KEY (ID_lectura) REFERENCES lectura_sensor(ID_lectura) ON DELETE SET NULL
);

-- =========================================================
-- 8. ACCIONES EJECUTADAS
-- =========================================================
CREATE TABLE accion_ejecutada (
    ID_accion INT AUTO_INCREMENT PRIMARY KEY,
    origen ENUM('Automático','Manual') NOT NULL,
    descripcion VARCHAR(200),
    comando ENUM('Encender','Apagar','Abrir','Cerrar','Establecer_Intensidad') NOT NULL,
    valor_comando DECIMAL(5,2),
    estado_comando ENUM('Pendiente','Enviado','Confirmado','Fallido') NOT NULL DEFAULT 'Pendiente',
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_envio DATETIME NULL,
    fecha_confirmacion DATETIME NULL,
    fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_fin DATETIME NULL,
    ID_actuador INT NOT NULL,
    ID_lectura BIGINT NULL,
    ID_regla INT NULL,
    ID_usuario INT NULL,
    CONSTRAINT FK_accion_actuador FOREIGN KEY (ID_actuador) REFERENCES actuador(ID_actuador) ON DELETE RESTRICT,
    CONSTRAINT FK_accion_lectura FOREIGN KEY (ID_lectura) REFERENCES lectura_sensor(ID_lectura) ON DELETE SET NULL,
    CONSTRAINT FK_accion_regla FOREIGN KEY (ID_regla) REFERENCES regla_automatizacion(ID_regla) ON DELETE SET NULL,
    CONSTRAINT FK_accion_usuario FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE SET NULL,
    CONSTRAINT CHK_fechas_accion CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
    CONSTRAINT CHK_origen_coherente CHECK (
        (origen = 'Automático' AND ID_regla IS NOT NULL AND ID_usuario IS NULL)
        OR
        (origen = 'Manual' AND ID_usuario IS NOT NULL AND ID_regla IS NULL)
    )
);

-- =========================================================
-- 9. TRIGGERS DE INTEGRIDAD
-- =========================================================
DELIMITER $$

-- Evitar dos plantaciones activas en la misma zona
CREATE TRIGGER trg_plantacion_evitar_simultaneas_insert
BEFORE INSERT ON plantacion FOR EACH ROW
BEGIN
    DECLARE activas INT;
    IF NEW.estado IN ('Germinacion','Crecimiento','Cosecha') THEN
        SELECT COUNT(*) INTO activas FROM plantacion
        WHERE ID_zona = NEW.ID_zona AND estado IN ('Germinacion','Crecimiento','Cosecha');
        IF activas > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La zona ya cuenta con una plantacion activa.';
        END IF;
    END IF;
END$$

CREATE TRIGGER trg_plantacion_evitar_simultaneas_update
BEFORE UPDATE ON plantacion FOR EACH ROW
BEGIN
    DECLARE activas INT;
    IF NEW.estado IN ('Germinacion','Crecimiento','Cosecha') THEN
        SELECT COUNT(*) INTO activas FROM plantacion
        WHERE ID_zona = NEW.ID_zona AND ID_plantacion <> NEW.ID_plantacion
          AND estado IN ('Germinacion','Crecimiento','Cosecha');
        IF activas > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La zona ya cuenta con una plantacion activa.';
        END IF;
    END IF;
END$$

-- Validar que métrica, actuador y zona pertenezcan a la misma zona
CREATE TRIGGER trg_regla_valida_zona_insert
BEFORE INSERT ON regla_automatizacion FOR EACH ROW
BEGIN
    DECLARE zona_metrica INT;
    DECLARE zona_actuador INT;
    SELECT d.ID_zona INTO zona_metrica FROM metrica m
        JOIN sensor s ON m.ID_sensor = s.ID_sensor
        JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
        WHERE m.ID_metrica = NEW.ID_metrica;
    SELECT d.ID_zona INTO zona_actuador FROM actuador a
        JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
        WHERE a.ID_actuador = NEW.ID_actuador;
    IF zona_metrica <> NEW.ID_zona OR zona_actuador <> NEW.ID_zona THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La regla mezcla zonas distintas.';
    END IF;
END$$

CREATE TRIGGER trg_regla_valida_zona_update
BEFORE UPDATE ON regla_automatizacion FOR EACH ROW
BEGIN
    DECLARE zona_metrica INT;
    DECLARE zona_actuador INT;
    SELECT d.ID_zona INTO zona_metrica FROM metrica m
        JOIN sensor s ON m.ID_sensor = s.ID_sensor
        JOIN dispositivo d ON s.ID_dispositivo = d.ID_dispositivo
        WHERE m.ID_metrica = NEW.ID_metrica;
    SELECT d.ID_zona INTO zona_actuador FROM actuador a
        JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
        WHERE a.ID_actuador = NEW.ID_actuador;
    IF zona_metrica <> NEW.ID_zona OR zona_actuador <> NEW.ID_zona THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La regla mezcla zonas distintas.';
    END IF;
END$$

-- Validar que el usuario tenga acceso al invernadero en acciones manuales
CREATE TRIGGER trg_accion_valida_usuario_insert
BEFORE INSERT ON accion_ejecutada FOR EACH ROW
BEGIN
    DECLARE invernadero_actuador INT;
    DECLARE acceso_valido INT;
    IF NEW.origen = 'Manual' THEN
        SELECT z.ID_invernadero INTO invernadero_actuador FROM actuador a
            JOIN dispositivo d ON a.ID_dispositivo = d.ID_dispositivo
            JOIN zona z ON d.ID_zona = z.ID_zona
            WHERE a.ID_actuador = NEW.ID_actuador;
        SELECT COUNT(*) INTO acceso_valido FROM usuario_invernadero ui
            WHERE ui.ID_usuario = NEW.ID_usuario AND ui.ID_invernadero = invernadero_actuador;
        IF acceso_valido = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El usuario no tiene acceso al invernadero.';
        END IF;
    END IF;
END$$

DELIMITER ;