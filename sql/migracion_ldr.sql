-- Actualiza el sensor de luz a LDR en el ESP32 de ejemplo sin borrar lecturas.
-- Ajusta la MAC y el GPIO ADC al montaje antes de ejecutar.
USE ecogrow;

UPDATE sensor s
JOIN dispositivo d ON d.ID_dispositivo = s.ID_dispositivo
JOIN metrica m ON m.ID_sensor = s.ID_sensor
SET s.modelo = 'LDR',
    s.puerto_pin = 'GPIO ADC',
    s.numero_serie = 'LDR-0001',
    m.unidad_medida = 'ADC'
WHERE d.mac_address = 'B0:3F:D3:6F:52:F4'
  AND LOWER(m.nombre_variable) IN ('luz', 'ldr', 'iluminación', 'iluminacion');
