USE ecogrow;

ALTER TABLE usuario
    ADD COLUMN imagen_perfil MEDIUMTEXT NULL AFTER correo;
