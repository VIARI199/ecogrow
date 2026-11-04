// EcoGrow — comportamiento del lado del navegador (sin dependencias)

// 1) Partículas flotantes de ambiente (esporas / polen luminoso)
document.querySelectorAll('.particles').forEach((contenedor) => {
    const cantidad = Number(contenedor.dataset.count) || 20;
    for (let i = 0; i < cantidad; i++) {
        const p = document.createElement('span');
        const tam = 2 + Math.random() * 5;
        p.style.left = Math.random() * 100 + '%';
        p.style.width = p.style.height = tam + 'px';
        p.style.animationDuration = 16 + Math.random() * 22 + 's';
        p.style.animationDelay = Math.random() * 20 + 's';
        contenedor.appendChild(p);
    }
});

// 2) Menú lateral en celulares
const sidebar = document.getElementById('sidebar');
const fondo = document.getElementById('sidebarBackdrop');
const boton = document.getElementById('menuBtn');
if (sidebar && boton) {
    const alternar = () => { sidebar.classList.toggle('open'); fondo.classList.toggle('open'); };
    boton.addEventListener('click', alternar);
    fondo.addEventListener('click', alternar);
}

// 3) Mostrar / ocultar contraseña
document.querySelectorAll('[data-toggle-pass]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const input = document.querySelector(btn.dataset.togglePass);
        const oculto = input.type === 'password';
        input.type = oculto ? 'text' : 'password';
        btn.innerHTML = oculto ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
    });
});

// 4) Cambio de tema (EcoGrow / Doki)
(function () {
    const THEME_KEY = 'ecogrow-theme';
    const THEMES = ['doki', 'eco'];

    const tryReadTheme = () => {
        try {
            return localStorage.getItem(THEME_KEY);
        } catch (error) {
            return null;
        }
    };

    const tryStoreTheme = (theme) => {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (error) {
            // Ignore storage errors in restricted browsers.
        }
    };

    const applyTheme = (theme) => {
        const safeTheme = THEMES.includes(theme) ? theme : 'doki';
        document.body.dataset.theme = safeTheme;
        tryStoreTheme(safeTheme);

        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            const icon = button.querySelector('.theme-toggle-icon');
            const label = button.querySelector('.theme-name');
            const active = safeTheme === 'doki';

            if (icon) {
                icon.className = `bi ${active ? 'bi-sun-fill' : 'bi-moon-stars-fill'} theme-toggle-icon`;
            }

            if (label) {
                label.textContent = active ? 'Doki' : 'Eco';
            }
        });
    };

    const stored = tryReadTheme();
    applyTheme(stored || document.body.dataset.theme || 'doki');

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
            const activeTheme = document.body.dataset.theme === 'doki' ? 'eco' : 'doki';
            applyTheme(activeTheme);
        });
    });
})();
