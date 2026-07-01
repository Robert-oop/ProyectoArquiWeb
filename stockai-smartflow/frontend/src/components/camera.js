/**
 * components/camera.js — Módulo de cámara para ingreso IA StockAI
 *
 * Flujo principal:
 *  1. Camera.mount(container, onCapture) — renderiza la zona de captura
 *  2. Al hacer click → intenta getUserMedia (cámara trasera en móvil)
 *     Fallback: input type="file" (escritorio o sin permisos)
 *  3. onCapture(file: File) — callback con la imagen capturada
 *
 * La imagen capturada se pasa al módulo de IA (ai.js) para identificación.
 */

const Camera = {
  /**
   * Renderiza el componente de captura en el container dado.
   * @param {HTMLElement} container
   * @param {Function}    onCapture(file) — callback con File de la imagen
   * @param {object}      options
   * @param {string}      options.title   — título de la zona de escaneo
   * @param {string}      options.sub     — subtítulo
   */
  mount(container, onCapture, {
    title = 'Fotografiar producto',
    sub   = 'Haz clic para abrir la cámara o arrastra una imagen',
  } = {}) {
    container.innerHTML = `
      <div class="scan-zone" id="scan-zone-btn" role="button" tabindex="0" aria-label="Abrir cámara">
        <div class="scan-zone-icon">📷</div>
        <div class="scan-zone-title">${title}</div>
        <div class="scan-zone-sub">${sub}</div>
        <div><div class="ai-badge">✦ Powered by IA</div></div>
        <!-- Input de archivo — acepta cualquier imagen; se normaliza a JPEG antes de enviar -->
        <input
          id="camera-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          style="display:none"
          aria-label="Seleccionar imagen"
        />
      </div>

      <!-- Vista previa de la imagen capturada -->
      <div id="camera-preview" style="display:none;margin-top:16px;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border)">
        <img id="camera-preview-img" style="width:100%;max-height:280px;object-fit:contain;display:block" alt="Vista previa del producto" />
        <div style="display:flex;gap:10px;padding:12px;background:var(--bg-elevated)">
          <button class="btn btn-ghost btn-sm" id="btn-camera-retry">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            Nueva captura
          </button>
          <button class="btn btn-primary btn-sm" id="btn-camera-confirm">
            Analizar con IA →
          </button>
        </div>
      </div>

      <!-- Estado: procesando IA -->
      <div id="camera-loading" style="display:none;text-align:center;padding:32px">
        <div class="spinner spinner-lg" style="margin:0 auto 16px"></div>
        <p style="color:var(--text-secondary);font-size:13px">Analizando imagen con el motor de visión artificial…</p>
      </div>
    `;

    this._bindEvents(container, onCapture);
  },

  /** Mostrar el spinner de "procesando IA" */
  setLoading(container, loading) {
    const zone    = container.querySelector('.scan-zone');
    const preview = document.getElementById('camera-preview');
    const loader  = document.getElementById('camera-loading');
    if (zone)    zone.style.display    = loading ? 'none' : 'flex';
    if (preview) preview.style.display = loading ? 'none' : '';
    if (loader)  loader.style.display  = loading ? 'block' : 'none';
  },

  /** Resetear al estado inicial (sin imagen) */
  reset(container) {
    const zone    = container.querySelector('.scan-zone');
    const preview = document.getElementById('camera-preview');
    const loader  = document.getElementById('camera-loading');
    const input   = document.getElementById('camera-file-input');
    if (zone)    zone.style.display    = 'flex';
    if (preview) preview.style.display = 'none';
    if (loader)  loader.style.display  = 'none';
    if (input)   input.value           = '';
    this._currentFile = null;
  },

  _currentFile: null,

  _bindEvents(container, onCapture) {
    const zone      = container.querySelector('.scan-zone');
    const fileInput = container.querySelector('#camera-file-input');

    // Click / Enter en la zona de escaneo
    zone?.addEventListener('click', () => this._openCamera(fileInput));
    zone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._openCamera(fileInput); }
    });

    // Drag & drop
    zone?.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = 'var(--accent-cyan)'; });
    zone?.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
    zone?.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = '';
      const file = e.dataTransfer?.files?.[0];
      if (file) this._handleFile(file, container, onCapture);
    });

    // Input de archivo seleccionado
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this._handleFile(file, container, onCapture);
    });

    // Botón retry
    container.querySelector('#btn-camera-retry')?.addEventListener('click', () => this.reset(container));

    // Botón confirmar → callback
    container.querySelector('#btn-camera-confirm')?.addEventListener('click', () => {
      if (this._currentFile && onCapture) onCapture(this._currentFile);
    });
  },

  _openCamera(fileInput) {
    // En móvil, el <input capture="environment"> ya abre la cámara trasera nativa.
    // En desktop, abre el selector de archivos.
    // No se usa getUserMedia porque await rompe la cadena de gesto de usuario
    // y el navegador bloquea el .click() programático en inputs ocultos.
    fileInput?.click();
  },

  _handleFile(file, container, onCapture) {
    // Aceptar cualquier imagen que el navegador pueda mostrar
    if (!file.type.startsWith('image/')) {
      window.Toast?.error('Solo se aceptan archivos de imagen.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      window.Toast?.error('La imagen no puede superar 10 MB.');
      return;
    }

    // Convertir a JPEG via canvas antes de guardar.
    // Esto normaliza HEIC/HEIF (iPhone), BMP, TIFF, WebP, PNG, etc.
    // a un JPEG estándar que el backend y la IA aceptan sin fallo.
    this._toJpeg(file).then(jpegFile => {
      this._currentFile = jpegFile;

      const zone    = container.querySelector('.scan-zone');
      const preview = document.getElementById('camera-preview');
      const imgEl   = document.getElementById('camera-preview-img');
      if (zone)    zone.style.display    = 'none';
      if (preview) preview.style.display = 'block';
      if (imgEl)   imgEl.src             = URL.createObjectURL(jpegFile);
    }).catch(() => {
      window.Toast?.error('No se pudo procesar la imagen. Intenta con otro archivo.');
    });
  },

  /**
   * Convierte cualquier imagen a JPEG usando el Canvas API del navegador.
   * El browser maneja la decodificación (incluyendo HEIC en iOS Safari),
   * y canvas.toBlob() siempre produce un JPEG limpio.
   * @param {File} file — archivo de imagen original
   * @returns {Promise<File>} — archivo JPEG normalizado
   */
  _toJpeg(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob(blob => {
          if (blob) {
            resolve(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
          } else {
            reject(new Error('canvas.toBlob falló'));
          }
        }, 'image/jpeg', 0.92);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo cargar la imagen'));
      };

      img.src = url;
    });
  },
};

export default Camera;
