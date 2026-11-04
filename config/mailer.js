const nodemailer = require('nodemailer');

const createTransporter = () => {
    const { EMAIL_USER, EMAIL_PASS } = process.env;
    if (!EMAIL_USER || !EMAIL_PASS) {
        throw new Error('Configura EMAIL_USER y EMAIL_PASS para enviar correos por Gmail.');
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });
};

const sendMail = async ({ to, subject, text, html }) => {
    const transporter = createTransporter();
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        text,
        html
    });
};

module.exports = { sendMail };
