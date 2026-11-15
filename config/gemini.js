const generarContenido = async (instrucciones, contenido, responseSchema) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        const error = new Error('GEMINI_API_KEY no está configurada.');
        error.code = 'GEMINI_NOT_CONFIGURED';
        throw error;
    }

    const modelo = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    let response;

    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
                'Api-Revision': '2026-05-20'
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: modelo,
                input: contenido,
                system_instruction: instrucciones,
                store: false,
                response_format: {
                    type: 'text',
                    mime_type: 'application/json',
                    schema: responseSchema
                }
            })
        });
    } catch (cause) {
        const error = new Error(cause.name === 'AbortError'
            ? 'La solicitud a Gemini superó el tiempo de espera.'
            : 'No fue posible conectar con Gemini.');
        error.code = cause.name === 'AbortError' ? 'GEMINI_TIMEOUT' : 'GEMINI_CONNECTION_ERROR';
        throw error;
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        let providerMessage = '';
        try {
            const payload = await response.json();
            providerMessage = payload.error?.message || '';
        } catch {
            providerMessage = '';
        }
        providerMessage = providerMessage.split(apiKey).join('[API KEY REDACTED]');
        const error = new Error(`Gemini respondió con estado HTTP ${response.status}.`);
        error.code = 'GEMINI_HTTP_ERROR';
        error.status = response.status;
        error.providerMessage = providerMessage;
        throw error;
    }

    let payload;
    try {
        payload = await response.json();
    } catch {
        const error = new Error('Gemini devolvió una respuesta no válida.');
        error.code = 'GEMINI_INVALID_RESPONSE';
        throw error;
    }

    const text = payload.steps
        ?.filter((step) => step.type === 'model_output')
        .flatMap((step) => step.content || [])
        .filter((part) => part.type === 'text')
        .map((part) => part.text || '')
        .join('')
        .trim() || payload.output_text?.trim();
    if (!text) {
        const error = new Error(`Gemini no devolvió contenido (estado: ${payload.status || 'desconocido'}).`);
        error.code = payload.status === 'completed' ? 'GEMINI_EMPTY_RESPONSE' : 'GEMINI_INCOMPLETE_RESPONSE';
        throw error;
    }

    try {
        return JSON.parse(text);
    } catch {
        const error = new Error('Gemini devolvió datos que no se pudieron interpretar.');
        error.code = 'GEMINI_INVALID_JSON';
        throw error;
    }
};

const mensajeError = (error) => {
    if (error.code === 'GEMINI_NOT_CONFIGURED') {
        return 'La IA no está configurada. Solicita al administrador que agregue GEMINI_API_KEY al archivo .env.';
    }
    if (error.code === 'GEMINI_TIMEOUT') {
        return 'Gemini tardó demasiado en responder. Inténtalo nuevamente en unos minutos.';
    }
    if (error.code === 'GEMINI_HTTP_ERROR') {
        if (error.status === 401 || error.status === 403) {
            return 'Google rechazó la API key o no tiene acceso a Gemini. Verifica GEMINI_API_KEY en .env.';
        }
        if (error.status === 404) {
            return 'El modelo Gemini configurado no está disponible. En .env usa GEMINI_MODEL=gemini-3.5-flash-lite y reinicia el servidor.';
        }
        if (error.status === 429) {
            return 'Se alcanzó el límite o la cuota de Gemini. Revisa la cuota de la API key e inténtalo más tarde.';
        }
        if (error.status === 503) {
            return 'Gemini está temporalmente saturado. Inténtalo nuevamente en unos minutos.';
        }
        return 'Gemini rechazó la solicitud. Revisa el detalle del error en la terminal del servidor.';
    }
    return 'No se pudo obtener una respuesta de Gemini. Inténtalo nuevamente en unos minutos.';
};

module.exports = { generarContenido, mensajeError };
