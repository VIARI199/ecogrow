# EcoGrow — Monitoreo de invernaderos con ESP32

Proyecto Node.js + Express + EJS + MySQL con arquitectura **MVC**, usando la misma estructura que los ejemplos del curso (03-Blog: `config/db.js`, `controllers/`, `routes/`, `views/partials`, `express-session` + `connect-flash`, Bootstrap 5).

## Cómo ejecutarlo

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Copia `.env.example` a `.env` y completa tus valores locales. **Nunca subas `.env` a GitHub ni publiques sus claves.**
   Si esas credenciales ya fueron compartidas o subidas a algún sitio, revócalas y genera unas nuevas antes de usar el proyecto.
3. Crea la base de datos en MySQL (XAMPP / Workbench / Clever Cloud):
   - Ejecuta `sql/schema.sql` (tu base de datos original).
   - Ejecuta `sql/seed.sql` (roles, usuarios y datos de ejemplo).
4. Configura el archivo `.env` con tus datos de MySQL y las claves del proyecto.
   - Si tu base de datos ya existía antes del login con Google, corre
     también `sql/migracion_google_login.sql` para agregarle la columna
     `google_id`.
   - Si la base de datos ya estaba creada, ejecuta también
     `sql/migracion_recuperacion_contrasena.sql` para habilitar la recuperación con código.
5. Para enviar códigos de recuperación por Gmail, configura `EMAIL_USER` con tu dirección Gmail
   y `EMAIL_PASS` con una contraseña de aplicación de Google (no la contraseña normal). La cuenta
   debe tener activada la verificación en dos pasos para crear una contraseña de aplicación.
   Configura también `SESSION_SECRET` y, opcionalmente, `RESET_CODE_SECRET`.
   ```env
   EMAIL_USER=tu-correo@gmail.com
   EMAIL_PASS=tu-contraseña-de-aplicacion
   ```
6. (Opcional) Para que funcione el botón "Iniciar sesión con Google":
   - Ve a [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Crear credenciales → ID de cliente de OAuth** → tipo "Aplicación web".
   - En "Orígenes de JavaScript autorizados" agrega `http://localhost:3000`.
   - Copia el Client ID y pégalo en `.env` como `GOOGLE_CLIENT_ID`.
   - Si no configuras esto, el botón simplemente no aparece y el login normal con correo/clave sigue funcionando igual.
7. Inicia el servidor:
   ```bash
   npm run dev
   ```
7. Abre http://localhost:3000

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
| `/login` `/registro` `/logout` | Autenticación con bcrypt y sesión | usuario, rol |
| `/olvide-contrasena` | Envía un código de 6 dígitos por correo; vence en 10 minutos y permite hasta 5 intentos | usuario, codigo_recuperacion |
| `/auth/google` (POST) | Login/registro automático con Google (si está configurado `GOOGLE_CLIENT_ID`) | usuario, rol |
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

## API para el ESP32

El firmware está en [`esp32/ecogrow_esp32.ino`](./esp32/ecogrow_esp32.ino). Lee un DHT22, un sensor capacitivo de humedad de suelo y un BH1750, y envía las métricas a EcoGrow por Wi-Fi.

### Configuración

1. Inicia la aplicación en el computador o servidor que comparte la red con el ESP32. En `.env`, configura `DEVICE_KEY` con una clave propia y larga (no uses una clave real en el código que publiques).
2. Registra en EcoGrow un dispositivo con la MAC que imprime el ESP32 en el monitor serial, asígnalo a una zona y agrega sus sensores/métricas con estos nombres exactos: `temperatura`, `humedad_ambiente`, `humedad_suelo` y `luz`.
3. En Arduino IDE, instala las bibliotecas **DHT sensor library** (Adafruit), **Adafruit Unified Sensor** y **BH1750**. Selecciona una placa ESP32 e ingresa las credenciales Wi-Fi, la dirección de la API y la misma clave `DEVICE_KEY` en el firmware.
4. Conecta DHT22 al GPIO 4, la salida analógica del sensor de suelo al GPIO 34, y el BH1750 por I2C (SDA GPIO 21, SCL GPIO 22). Alimenta los módulos según las especificaciones de sus placas y usa una tierra común. Ajusta `SOIL_DRY_RAW` y `SOIL_WET_RAW` midiendo tu sensor en seco y en suelo saturado.
5. Carga el firmware y abre el monitor serial a 115200 baudios. Cuando el POST responde correctamente, el dashboard recoge las lecturas desde `/dashboard/datos` cada cinco segundos.

En `API_URL`, usa la IP local del computador (por ejemplo `http://192.168.1.20:3000/api/lecturas`), no `localhost`: para el ESP32, `localhost` es el propio dispositivo. Permite el puerto 3000 en el firewall si corresponde. Para instalaciones en un servidor remoto, configura HTTPS y el certificado de confianza en el cliente ESP32; no envíes la clave por una red pública usando HTTP.

### Contrato de la API

`POST /api/lecturas` requiere el encabezado `x-device-key: <DEVICE_KEY>` y recibe este JSON:

```json
{
  "mac": "AA:BB:CC:DD:EE:01",
  "lecturas": {
    "temperatura": 24.5,
    "humedad_ambiente": 68,
    "humedad_suelo": 40,
    "luz": 8400
  }
}
```

El servidor guarda las métricas asociadas al dispositivo, evalúa reglas/umbrales y marca el dispositivo como Online. El estado solo se considera en línea durante 90 segundos desde la última comunicación; si el ESP32 deja de enviar datos, se muestra como apagado/offline. Si `DEVICE_KEY` no está configurada, la API rechaza las peticiones. `GET /api/comandos/:mac` permite consultar acciones pendientes de actuadores.

secret: process.env.SESSION_SECRET || 'clave-secreta-ecogrow'secret: process.env.SESSION_SECRET || 'clave-secreta-ecogrow'