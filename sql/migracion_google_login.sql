-- Ejecuta esto SOLO si ya habías creado la base de datos ecogrow antes
-- de agregar el login con Google (si vas a crearla desde cero, no hace
-- falta: ya está incluido en schema.sql).
USE ecogrow;

ALTER TABLE usuario
  MODIFY COLUMN contrasena_hash VARCHAR(255) NULL,
  ADD COLUMN google_id VARCHAR(255) NULL UNIQUE AFTER contrasena_hash;
