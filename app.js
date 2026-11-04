require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');

const { isAuth, isAdmin } = require('./middlewares/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// CONFIGURACIÓN DE EJS
// -----------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -----------------------------
// MIDDLEWARES
// -----------------------------
app.use(express.urlencoded({ extended: true, limit: '5mb' }));   // formularios
app.use(express.json({ limit: '5mb' }));                         // JSON (ESP32)
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------
// SESSION + FLASH
// -----------------------------
app.use(session({
    secret: process.env.SESSION_SECRET || 'clave-secreta-ecogrow',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// Variables disponibles en todas las vistas
app.use((req, res, next) => {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.usuario = req.session.usuario || null;
    res.locals.ruta = req.originalUrl;
    res.locals.googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    next();
});

// Middleware separado para las estadísticas de la barra superior (MVC)
app.use(require('./middlewares/navbarStats'));

// -----------------------------
// RUTAS
// -----------------------------
app.use('/', require('./routes/publicRoutes'));     // inicio, nosotros, contacto
app.use('/', require('./routes/authRoutes'));       // login, registro, logout
app.use('/api', require('./routes/apiRoutes'));     // ESP32

app.use('/dashboard', isAuth, require('./routes/dashboardRoutes'));
app.use('/invernaderos', isAuth, require('./routes/invernaderoRoutes'));
app.use('/zonas', isAuth, require('./routes/zonaRoutes'));
app.use('/especies', isAuth, require('./routes/especieRoutes'));
app.use('/plantaciones', isAuth, require('./routes/plantacionRoutes'));
app.use('/dispositivos', isAuth, require('./routes/dispositivoRoutes'));
app.use('/lecturas', isAuth, require('./routes/lecturaRoutes'));
app.use('/alertas', isAuth, require('./routes/alertaRoutes'));
app.use('/admin', isAuth, isAdmin, require('./routes/adminRoutes'));

// Rutas de la experiencia de usuario. Se mantienen las rutas legacy para no
// romper enlaces guardados ni integraciones existentes.
app.use('/app', isAuth, require('./routes/dashboardRoutes'));
app.use('/app/plantas', isAuth, require('./routes/plantacionRoutes'));
app.use('/app/espacios', isAuth, require('./routes/invernaderoRoutes'));
app.use('/app/zonas', isAuth, require('./routes/zonaRoutes'));
app.use('/app/historial', isAuth, require('./routes/lecturaRoutes'));
app.use('/app/alertas', isAuth, require('./routes/alertaRoutes'));
app.use('/app/componentes', isAuth, require('./routes/dispositivoRoutes'));
app.use('/app', isAuth, require('./routes/userRoutes'));

// 404
app.use((req, res) => res.status(404).render('404'));

// -----------------------------
// SERVIDOR
// -----------------------------
app.listen(PORT, () => {
    console.log(`EcoGrow Up! http://localhost:${PORT}`);
});