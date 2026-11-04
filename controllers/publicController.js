// PÁGINAS PÚBLICAS (como en Web-Simple / Web-Form)
const inicio = (req, res) => res.render('index');
const nosotros = (req, res) => res.render('nosotros');

const contactoForm = (req, res) => res.render('contacto', { mensajeExito: null, datos: {} });

// Evita que lo que escribe el usuario se interprete como HTML en el correo
const escapar = (texto) => String(texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const contactoEnviar = async (req, res) => {
    const { nombre, correo, asunto, mensaje } = req.body;
    if (!nombre || !correo || !asunto || !mensaje) {
        return res.render('contacto', {
            mensajeExito: null, datos: req.body, error: ['Completa todos los campos del formulario.']
        });
    }

    try {
        const respuesta = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'EcoGrow <onboarding@resend.dev>',
                to: [process.env.CONTACT_TO],
                reply_to: correo,
                subject: `[EcoGrow] ${asunto}`,
                html: `<h3>Nuevo mensaje de contacto</h3>
                       <p><b>Nombre:</b> ${escapar(nombre)}</p>
                       <p><b>Correo:</b> ${escapar(correo)}</p>
                       <p><b>Asunto:</b> ${escapar(asunto)}</p>
                       <p><b>Mensaje:</b><br>${escapar(mensaje).replace(/\n/g, '<br>')}</p>`
            })
        });

        if (!respuesta.ok) {
            console.error('Resend respondió:', await respuesta.text());
            throw new Error('Resend rechazó el envío');
        }

        res.render('contacto', { mensajeExito: 'Tu mensaje ha sido enviado correctamente. Te responderemos pronto 🌱', datos: {} });
    } catch (error) {
        console.error(error);
        res.render('contacto', { mensajeExito: null, datos: req.body, error: ['No pudimos enviar tu mensaje. Inténtalo más tarde.'] });
    }
};

module.exports = { inicio, nosotros, contactoForm, contactoEnviar };