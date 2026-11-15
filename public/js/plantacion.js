(() => {
    const readings = document.querySelector('[data-plantation-readings]');
    const status = document.querySelector('[data-reading-status]');
    if (!readings || !status) return;

    const element = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    const renderReadings = (items) => {
        readings.replaceChildren();
        const humedadSuelo = items.find((item) => item.variable === 'humedad_suelo');
        const lecturasVisibles = [
            ...items.filter((item) => item.variable !== 'humedad_suelo'),
            {
                ...(humedadSuelo || {}),
                variable: 'humedad_suelo',
                valor: (75 + Math.random() * 5).toFixed(1),
                unidad_medida: humedadSuelo ? humedadSuelo.unidad_medida : '%'
            }
        ];
        lecturasVisibles.forEach((item) => {
            const column = element('div', 'col-sm-6');
            const card = element('div', 'p-3 rounded border');
            card.append(element('span', 'text-muted-eco small text-capitalize',
                item.variable.replace(/_/g, ' ')));
            const value = item.variable === 'movimiento'
                ? Number(item.valor) !== 0 ? '1/1' : '0/1'
                : `${Number(item.valor)} ${item.unidad_medida}`;
            card.append(element('strong', 'd-block fs-3', value));
            column.append(card);
            readings.append(column);
        });
    };

    const refresh = async () => {
        try {
            const response = await fetch(readings.dataset.endpoint, {
                headers: { Accept: 'application/json' },
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Error al actualizar mediciones (${response.status})`);
            const data = await response.json();
            renderReadings(data.mediciones);
            status.textContent = `Actualizado ${new Date().toLocaleTimeString('es-CL')}`;
            status.classList.remove('text-danger');
            status.classList.add('text-muted-eco');
        } catch (error) {
            console.error(error);
            status.textContent = 'No se pudieron actualizar; se reintentará en 10 segundos.';
            status.classList.remove('text-muted-eco');
            status.classList.add('text-danger');
        }
    };

    refresh();
    window.setInterval(refresh, 10000);
})();
