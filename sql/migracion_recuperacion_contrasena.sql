CREATE TABLE codigo_recuperacion (
    ID_usuario INT PRIMARY KEY,
    codigo_hash CHAR(64) NOT NULL,
    expira_en DATETIME NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
    CONSTRAINT FK_codigo_recuperacion_usuario
        FOREIGN KEY (ID_usuario) REFERENCES usuario(ID_usuario) ON DELETE CASCADE
);
