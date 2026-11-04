(() => {
    const sensorContainer = document.getElementById('dashboard-sensors');
    const alertContainer = document.getElementById('dashboard-alerts-list');
    const status = document.getElementById('dashboard-refresh-status');
    const sensorIcons = {
        temperatura: 'thermometer-half',
        humedad_ambiente: 'moisture',
        humedad_suelo: 'droplet-half',
        luz: 'brightness-high'
    };
    let updating = false;

    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    const renderSensors = (lecturas, totales) => {
        sensorContainer.replaceChildren();
        const definitions = [
            ['temperatura', 'thermometer-half', 'Temperatura ambiente', '°C'],
            ['humedad_ambiente', 'moisture', 'Humedad relativa del aire', '%'],
            ['humedad_suelo', 'droplet-half', 'Humedad del suelo', '%'],
            ['luz', 'brightness-high', 'Nivel de iluminación', 'lux'],
            ['co2', 'cloud-haze2', 'Calidad del aire / CO₂', 'ppm']
        ];
        definitions.forEach(([variable, iconName, title, unit], index) => {
            const lectura = lecturas.find(item => item.nombre_variable === variable);
            const column = element('div', 'col-sm-6 col-lg-3');
            const card = element('div', 'glass hover p-3 sensor-card h-100');
            card.dataset.delay = `${index * 70}`;

            const header = element('div', 'd-flex justify-content-between align-items-start');
            const icon = element('span', 'icono');
            const iconElement = element('i', `bi bi-${iconName}`);
            icon.append(iconElement);
            const online = element('span', 'pill');
            online.style.padding = '.2rem .6rem';
            online.append(element('span', `dot ${lectura ? 'dot-ok' : 'dot-warn'} me-0`));
            online.append(document.createTextNode(lectura ? ' En línea' : ' Sin datos'));
            header.append(icon, online);

            const variableLabel = element('div', 'text-muted-eco small mt-3', title);
            const value = element('div', 'valor', lectura ? String(Number(lectura.valor)) : '—');
            value.append(element('small', 'fs-6 text-muted-eco fw-normal', ` ${lectura ? lectura.unidad_medida : unit}`));
            const location = element('div', 'small text-muted-eco mt-2',
                lectura ? `${lectura.invernadero} · ${lectura.nombre_zona}` : 'Conecta el sensor para ver la medición');

            card.append(header, variableLabel, value, location);
            column.append(card);
            sensorContainer.append(column);
        });
        const connection = element('div', 'col-sm-6 col-lg-3');
        connection.append(element('div', 'glass hover p-3 sensor-card h-100',
            `${totales.online}/${totales.dispositivos} ${totales.online > 0 ? 'nodos en línea' : 'nodos apagados'}`));
        sensorContainer.append(connection);
    };

    const renderAlerts = (alertas) => {
        alertContainer.replaceChildren();
        if (alertas.length === 0) {
            const empty = element('p', 'text-muted-eco mb-0');
            empty.append(element('span', 'dot dot-ok'));
            empty.append(document.createTextNode('Todo en orden, no hay alertas nuevas.'));
            alertContainer.append(empty);
            return;
        }

        alertas.forEach((alerta) => {
            const row = element('div', 'd-flex justify-content-between align-items-center gap-2 border-bottom py-2');
            const message = element('span', 'small');
            const severity = alerta.nivel_urgencia === 'Critica' || alerta.nivel_urgencia === 'Alta'
                ? 'dot-crit'
                : 'dot-warn';
            message.append(element('span', `dot ${severity}`));
            message.append(document.createTextNode(alerta.mensaje));
            row.append(message, element('span', 'badge text-bg-secondary', alerta.nivel_urgencia));
            alertContainer.append(row);
        });
    };

    const refreshDashboard = async () => {
        if (updating) return;
        updating = true;
        try {
            const response = await fetch(window.location.pathname.startsWith('/app')
                ? '/app/datos' : '/dashboard/datos', {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Error al actualizar el panel (${response.status})`);
            const data = await response.json();

            document.querySelector('[data-dashboard-total="invernaderos"]').textContent = data.totales.invernaderos;
            document.querySelector('[data-dashboard-total="plantaciones"]').textContent = data.totales.plantaciones;
            document.querySelector('[data-dashboard-total="dispositivos"]').textContent =
                `${data.totales.online} / ${data.totales.dispositivos}`;
            document.querySelector('[data-dashboard-total="alertas"]').textContent = data.totales.alertas;
            renderSensors(data.ultimas, data.totales);
            renderAlerts(data.alertas);
            status.textContent = `Actualizado ${new Date().toLocaleTimeString('es-CL')}`;
            status.classList.remove('text-danger');
            status.classList.add('text-muted-eco');
        } catch (error) {
            console.error(error);
            status.textContent = 'No se pudieron actualizar los datos; se reintentará en 30 segundos.';
            status.classList.remove('text-muted-eco');
            status.classList.add('text-danger');
        } finally {
            updating = false;
        }
    };

    window.setInterval(refreshDashboard, 30000);
})();
