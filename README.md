# EcoGrow — Monitoreo de invernaderos con ESP32

Proyecto Node.js + Express + EJS + MySQL con arquitectura **MVC**, usando la misma estructura que los ejemplos del curso (03-Blog: `config/db.js`, `controllers/`, `routes/`, `views/partials`, `express-session` + `connect-flash`, Bootstrap 5).

## Cómo ejecutarlo

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Crea la base de datos en MySQL (XAMPP / Workbench / Clever Cloud):
   - Ejecuta `sql/schema.sql` (tu base de datos original).
   - Ejecuta `sql/seed.sql` (roles, usuarios y datos de ejemplo).
3. Crea el archivo `.env` con tus datos de MySQL y las claves del proyecto. Nunca subas este archivo ni publiques sus claves.
   - Si tu base de datos ya existía antes del login con Google, corre
     también `sql/migracion_google_login.sql` para agregarle la columna
     `google_id`.
   - Si la base de datos ya estaba creada, ejecuta también
     `sql/migracion_recuperacion_contrasena.sql` para habilitar la recuperación con código.
4. Para enviar códigos de recuperación por Gmail, configura `EMAIL_USER` con tu dirección Gmail
   y `EMAIL_PASS` con una contraseña de aplicación de Google (no la contraseña normal). La cuenta
   debe tener activada la verificación en dos pasos para crear una contraseña de aplicación.
   Configura también `SESSION_SECRET` y, opcionalmente, `RESET_CODE_SECRET`.
   ```env
   EMAIL_USER=tu-correo@gmail.com
   EMAIL_PASS=tu-contraseña-de-aplicacion
   ```
5. (Opcional) Para que funcione el botón "Iniciar sesión con Google":
   - Ve a [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Crear credenciales → ID de cliente de OAuth** → tipo "Aplicación web".
   - En "Orígenes de JavaScript autorizados" agrega `http://localhost:3000`.
   - Copia el Client ID y pégalo en `.env` como `GOOGLE_CLIENT_ID`.
   - Si no configuras esto, el botón simplemente no aparece y el login normal con correo/clave sigue funcionando igual.
6. (Opcional) Para habilitar la IA de plantas y el autocompletado de especies, crea una API key en [Google AI Studio](https://aistudio.google.com/apikey) y agrégala a `.env`:
   ```env
   GEMINI_API_KEY=tu-api-key
   # Opcional; por defecto se usa gemini-3.5-flash-lite
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```
   La IA está disponible en `/app/ia` y solo responde consultas sobre plantas, su cultivo y cuidados. En `/especies/create`, escribe el nombre común y pulsa **Completar datos con IA**; revisa los rangos sugeridos antes de guardar.
7. Inicia el servidor:
   ```bash
   npm run dev
   ```
8. Abre http://localhost:3000

### Usuarios de prueba (contraseña `EcoGrow123`)
| Correo | Rol |
|---|---|
| admin@ecogrow.cl | Administrador |
| vicente@ecogrow.cl | Usuario |

## Estructura

```text
app.js                 Servidor, sesión, flash y rutas
config/db.js           Conexión MySQL (mysql2/promise)
middlewares/auth.js    isAuth, isAdmin, isDevice
controllers/           Lógica (CRUD de cada tabla)
routes/                Rutas Express
views/                 Vistas EJS (partials, auth, admin, cada módulo)
public/css/styles.css  Diseño EcoGrow (vidrio, verde, minimalista)
public/js/app.js       Partículas, menú lateral, ver contraseña
public/img/            Logos, greenhouse-bg.jpg y camera-feed.jpg
sql/schema.sql         Base de datos
sql/seed.sql           Datos de ejemplo
```

## Diseño

Visitantes: fondo de invernadero con partículas, logo y tarjetas de vidrio (inicio, login, registro, nosotros, contacto).
Usuarios con sesión: menú lateral + barra superior con alertas nuevas y ESP32 en línea (se leen de MySQL en `app.js`).

## Páginas

| Ruta | Qué hace | Tablas |
|---|---|---|
| `/` `/nosotros` `/contacto` | Páginas públicas y formulario (como Web-Form) | — |
| `/login` `/registro` `/logout` | Autenticación con bcrypt y sesión; cada cuenta nueva recibe acceso al invernadero del ESP32 actual | usuario, rol, usuario_invernadero |
| `/olvide-contrasena` | Envía un código de 6 dígitos por correo; vence en 10 minutos y permite hasta 5 intentos | usuario, codigo_recuperacion |
| `/auth/google` (POST) | Login/registro automático con Google (si está configurado `GOOGLE_CLIENT_ID`); las cuentas nuevas reciben acceso al ESP32 actual | usuario, rol, usuario_invernadero |
| `/dashboard` | Última lectura de cada sensor, totales y alertas; se actualiza automáticamente cada 5 segundos | lectura_sensor, metrica… |
| `/invernaderos` | CRUD + mapa de zonas | invernadero, usuario_invernadero |
| `/zonas` | CRUD | zona |
| `/especies` | CRUD con rangos ideales | especie |
| `/plantaciones` | CRUD (respeta el trigger "una plantación activa por zona") | plantacion |
| `/dispositivos` | CRUD de ESP32 + agregar sensores y métricas | dispositivo, sensor, metrica, actuador |
| `/lecturas` | Historial 24h/7d/30d con gráfico (Chart.js), promedio/máx/mín | lectura_sensor |
| `/alertas` | Filtrar y cambiar estado (Reconocida/Resuelta/Descartada) | alerta |
| `/admin` | Solo administradores: estadísticas, dispositivos, acciones | accion_ejecutada… |
| `/admin/usuarios` | Crear usuarios, cambiar rol/estado, eliminar | usuario, rol |

## Cambiar el ESP32 de invernadero y limpiar los datos anteriores

Al crear un invernadero, el formulario permite seleccionar un ESP32 registrado y accesible para la cuenta. EcoGrow crea una zona para él y lo mueve allí. Para conservar ese ESP32 y su historial, primero crea el nuevo invernadero y asígnale el dispositivo; después haz un respaldo y ejecuta `sql/migracion_limpiar_invernaderos_antiguos.sql`. El script es global: conserva el invernadero/zona del ESP32 seleccionado, sus sensores, actuadores y lecturas, pero elimina las plantaciones, alertas, acciones, reglas, demás dispositivos y los invernaderos/zonas del resto de las cuentas también. Conserva las cuentas y el catálogo de especies. Después puedes volver a crear el tomate en la zona del ESP32. Cambia la MAC indicada en el script si corresponde.

## API para el ESP32

El firmware del ESP32 no está incluido en este repositorio. La aplicación recibe por Wi-Fi las métricas enviadas por un firmware compatible con la API descrita abajo.

### Configuración

1. Inicia la aplicación en el computador o servidor que comparte la red con el ESP32. En `.env`, configura `DEVICE_KEY` con una clave propia y larga (no uses una clave real en el código que publiques).
2. Registra en EcoGrow un dispositivo con la MAC que imprime el ESP32 en el monitor serial, asígnalo a una zona y agrega sus sensores/métricas con estos nombres: `Temperatura`, `Humedad ambiental`, `Humedad del suelo`, `Luz`, `Calidad del aire` y `Movimiento` (más un actuador llamado `Buzzer`). Para una base existente ejecuta `sql/migracion_ldr.sql`; `sql/migracion_esp32_real.sql` registra desde cero el dispositivo de ejemplo.
3. En Arduino IDE, instala las bibliotecas **DHT sensor library** (Adafruit), **Adafruit Unified Sensor** y las demás que use tu firmware. Selecciona una placa ESP32 e ingresa las credenciales Wi-Fi, la dirección de la API y la misma clave `DEVICE_KEY` en el firmware.
4. Conecta DHT22 al GPIO 4, la salida analógica del sensor de suelo al GPIO 34 y la salida analógica del LDR a un GPIO con entrada ADC, según tu montaje. Alimenta los módulos según las especificaciones de sus placas y usa una tierra común. Ajusta las lecturas/calibración del firmware a los sensores instalados. Sin calibración, la lectura del LDR es un valor ADC, no lux.
5. Carga el firmware y abre el monitor serial a 115200 baudios. Cuando el POST responde correctamente, el dashboard recoge las lecturas desde `/dashboard/datos` cada cinco segundos.

En `API_URL`, usa la IP local del computador (por ejemplo `http://192.168.1.20:3000/api/lecturas`), no `localhost`: para el ESP32, `localhost` es el propio dispositivo. Permite el puerto 3000 en el firewall si corresponde. Para instalaciones en un servidor remoto, configura HTTPS y el certificado de confianza en el cliente ESP32; no envíes la clave por una red pública usando HTTP.

Al registrarse, cada cuenta nueva queda asociada como Operador al invernadero que contiene el ESP32 actual (`B0:3F:D3:6F:52:F4`). Es el mismo dispositivo físico y sus lecturas se comparten; no se crean dispositivos duplicados. Al moverlo a un invernadero nuevo, se conservan los accesos de sus usuarios. Si las cuentas existentes ya no tienen acceso, ejecuta una vez `sql/migracion_asignar_usuarios_esp32.sql`. El ESP32 debe estar registrado antes de crear cuentas, también en el registro con Google y desde administración.

### Contrato de la API

`POST /api/lecturas` requiere el encabezado `x-device-key: <DEVICE_KEY>` y recibe este JSON:

```json
{
  "mac": "B0:3F:D3:6F:52:F4",
  "lecturas": {
    "Temperatura": 24.5,
    "Humedad ambiental": 68,
    "Humedad del suelo": 40,
    "LDR": 2048,
    "Calidad del aire": 30,
    "Movimiento": 0
  }
}
```

El servidor asocia tanto `LDR` como `Luz` a la métrica de luz, guarda las lecturas recibidas, evalúa reglas/umbrales y marca el dispositivo como Online. La unidad `ADC` representa el valor analógico enviado por el ESP32; para mostrar lux hay que calibrar el sensor y convertir el valor en el firmware. Si `DEVICE_KEY` no está configurada, la API rechaza las peticiones. `GET /api/comandos/:mac` permite consultar acciones pendientes de actuadores.
