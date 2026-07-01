"""
vision_math.py — Bloques matemáticos de procesamiento de imagen
================================================================
Álgebra, geometría y visión computacional tradicional.
Sin ML ni dependencias pesadas — solo OpenCV + NumPy.

Bloques:
  1. Calibración por moneda  — HoughCircles + approxPolyDP + Harris + HSV
  2. Extracción de dimensiones — Otsu + BoundingBox + área real
  3. Firma de color            — Histograma HSV normalizado + Distancia Euclidiana
  4. Validación de logo        — Correlación Cruzada Normalizada (NCC / TM_CCOEFF_NORMED)
  5. Base de datos local       — Diccionario de productos de referencia con tolerancias
"""
import cv2
import numpy as np
import os
import logging
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger("stockai-ai.vision_math")


# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 5 — BASE DE DATOS LOCAL
# ═══════════════════════════════════════════════════════════════════════════════

# Diámetros reales de monedas chilenas (mm)
COIN_DIAMETERS: Dict[str, float] = {
    "50_decagono":  25.0,
    "500_bimetal":  26.0,
    "100_nueva":    23.5,
    "100_vieja":    27.0,
    "10_monometal": 21.0,
}

# Productos de referencia.
# color_vector se inicializa automáticamente en _init_db_vectors() a partir de
# dominant_hue_range (vector sintético). Para producción: reemplazar con
# vectores reales calculados de fotos de referencia via color_signature().
#
# logo_path: ruta relativa a ai-service/logos/ con la imagen del logo.
#            Si el archivo no existe, el bloque 4 retorna gamma=0.
PRODUCT_DB: Dict[str, Dict[str, Any]] = {
    "pepsi_lata_350ml": {
        "display_name":       "Lata Pepsi 350ml",
        "height_cm":          12.3,   "height_tol": 0.5,
        "width_cm":            6.6,   "width_tol":  0.3,
        "aspect_ratio":        1.86,  "ar_tol":     0.15,
        "dominant_hue_range": (100, 130),   # Azul  HSV [0–180]
        "logo_path":           None,
        "color_vector":        None,
    },
    "coca_lata_350ml": {
        "display_name":       "Lata Coca-Cola 350ml",
        "height_cm":          12.3,   "height_tol": 0.5,
        "width_cm":            6.6,   "width_tol":  0.3,
        "aspect_ratio":        1.86,  "ar_tol":     0.15,
        "dominant_hue_range": (0, 10),      # Rojo  HSV [0–180]
        "logo_path":           None,
        "color_vector":        None,
    },
    "jugo_caja_1l": {
        "display_name":       "Caja Jugo 1L",
        "height_cm":          20.5,   "height_tol": 0.5,
        "width_cm":            7.0,   "width_tol":  0.3,
        "aspect_ratio":        2.92,  "ar_tol":     0.20,
        "dominant_hue_range": (20, 40),     # Amarillo HSV
        "logo_path":           None,
        "color_vector":        None,
    },
}

# Umbral de distancia euclidiana para aceptar un match de color.
# Rango para vectores L2-normalizados de solo Hue: [0, √2] máx.
# 0.40 es suficiente para discriminar colores primarios distintos.
# Bajar a 0.20 cuando se usen vectores reales (más precisos).
COLOR_DIST_THRESHOLD = 0.40

# Vector usa solo canal Hue — saturación excluida intencionalmente:
# la saturación varía por color (azul≈bin6, amarillo≈bin7) lo que
# requeriría calibración per-producto. El Hue solo discrimina bien
# entre los colores primarios del catálogo (azul/rojo/amarillo).
# Para producción con vectores reales de fotos, incluir H+S con
# color_signature() real.
_HUE_BINS = 18
_SAT_BINS  =  8   # reservado para futura extensión H+S con datos reales


def _synthetic_color_vector(hue_range: Tuple[int, int]) -> np.ndarray:
    """
    Genera un vector HSV sintético de referencia usando pico único (spike).

    Un histograma real de un producto tiene el mayor peso concentrado en
    muy pocos bins (el color dominante ocupa el bin del tono predominante
    y el bin de alta saturación). El vector resultante se comporta como
    una imagen de color puro — lo más parecido a lo que produce
    color_signature() con una foto real bien iluminada.

    Bin de tono    → centro del rango [hue_min, hue_max]
    Bin de sat     → bin 6/8 = saturación alta (colores de producto vivos)

    NOTA: Para producción, poblar la DB con vectores reales:
        db["pepsi"]["color_vector"] = color_signature(cv2.imread("pepsi_ref.jpg"))
    """
    h_vec = np.zeros(_HUE_BINS, dtype=np.float32)
    s_vec = np.zeros(_SAT_BINS,  dtype=np.float32)

    # Bin central del tono (mapeo lineal [0,180] → [0, _HUE_BINS-1])
    center_hue = (hue_range[0] + hue_range[1]) / 2.0
    h_bin = int(center_hue * _HUE_BINS / 180.0)
    h_bin = max(0, min(_HUE_BINS - 1, h_bin))
    h_vec[h_bin] = 1.0

    # Solo canal Hue — saturación omitida en el vector sintético porque
    # cada color tiene un bin de saturación diferente y requeriría
    # calibración individual. H solo discrimina bien entre colores primarios.
    vec  = h_vec.copy()
    norm = np.linalg.norm(vec)
    return (vec / norm).astype(np.float32) if norm > 0 else vec


def _init_db_vectors() -> None:
    for entry in PRODUCT_DB.values():
        if entry["color_vector"] is None and entry.get("dominant_hue_range"):
            entry["color_vector"] = _synthetic_color_vector(entry["dominant_hue_range"])


_init_db_vectors()


# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 1 — CALIBRACIÓN POR MONEDA
# Constante de escala K (mm/px) calculada con la Transformada de Hough
# para Círculos + análisis de contorno (approxPolyDP) + Harris + gradiente HSV.
# ═══════════════════════════════════════════════════════════════════════════════

def detect_coin(img: np.ndarray) -> Optional[float]:
    """
    Localiza la moneda de referencia en la imagen y calcula K = mm/px.

    Pipeline:
      1. Blur Gaussiano para suavizar ruido antes de Hough.
      2. HoughCircles detecta candidatos circulares.
      3. _identify_coin_mm() clasifica el tipo de moneda por su geometría/color.
      4. K = diámetro_real_mm / (2 * radio_en_px).

    Retorna None si no encuentra ningún círculo que pase los filtros.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (9, 9), 2)
    h, w = gray.shape

    min_r = max(15, min(h, w) // 30)
    max_r = min(h, w) // 6

    circles = cv2.HoughCircles(
        blur, cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(30, min_r * 2),
        param1=100, param2=30,
        minRadius=min_r, maxRadius=max_r,
    )
    if circles is None:
        return None

    cx, cy, r = np.round(circles[0][0]).astype(int)
    real_mm   = _identify_coin_mm(img, int(cx), int(cy), int(r))
    K         = real_mm / (2.0 * r)
    logger.debug("[COIN] r=%dpx real=%.1fmm K=%.5f mm/px", r, real_mm, K)
    return K


def _identify_coin_mm(img: np.ndarray, cx: int, cy: int, r: int) -> float:
    """
    Clasifica la moneda detectada y retorna su diámetro real en mm.

    Orden de tests (determinista, de más a menos específico):
      1. Decágono ($50)    — approxPolyDP + Harris corners
      2. $500 bimetálica  — núcleo dorado, aro plateado (análisis HSV anular)
      3. $100 nueva       — núcleo plateado, aro dorado
      4. $100 vieja / $10 — monometálica; diferencia por tamaño relativo
    """
    h, w = img.shape[:2]
    x1, y1 = max(0, cx - r), max(0, cy - r)
    x2, y2 = min(w, cx + r), min(h, cy + r)
    roi = img[y1:y2, x1:x2]

    if roi.size == 0:
        return COIN_DIAMETERS["100_nueva"]

    gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.ndim == 3 else roi
    blur_roi = cv2.GaussianBlur(gray_roi, (5, 5), 1)

    # ── Test 1: Decágono ($50) ─────────────────────────────────────────────────
    # approxPolyDP sobre el contorno del ROI binarizado.
    # Un decágono regular aproximado con epsilon=4% del perímetro → 8–13 vértices.
    _, bin_roi = cv2.threshold(blur_roi, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(bin_roi, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        c       = max(contours, key=cv2.contourArea)
        eps     = 0.04 * cv2.arcLength(c, True)
        approx  = cv2.approxPolyDP(c, eps, True)
        n_verts = len(approx)
        if 8 <= n_verts <= 13:
            # Refuerzo con Harris: el decágono produce ~10 picos de esquina bien marcados
            harris       = cv2.cornerHarris(gray_roi.astype(np.float32), 3, 3, 0.04)
            _, n_corners = _count_harris_peaks(harris, rel_thr=0.25)
            if 6 <= n_corners <= 16:
                return COIN_DIAMETERS["50_decagono"]

    # ── Tests 2 & 3: Bimetálicas — análisis de gradiente de color HSV ─────────
    hsv        = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    c_gold, c_silver = _annulus_color(hsv, 0.00, 0.40)   # zona central
    o_gold, o_silver = _annulus_color(hsv, 0.40, 1.00)   # aro exterior

    if c_gold and o_silver:   # $500: núcleo dorado, aro plateado
        return COIN_DIAMETERS["500_bimetal"]
    if c_silver and o_gold:   # $100 nueva: núcleo plateado, aro dorado
        return COIN_DIAMETERS["100_nueva"]

    # ── Tests 4 & 5: Monometálicas — diferencia por tamaño relativo ───────────
    r_rel = r / min(img.shape[:2])
    return COIN_DIAMETERS["100_vieja"] if r_rel > 0.09 else COIN_DIAMETERS["10_monometal"]


def _count_harris_peaks(harris: np.ndarray,
                         rel_thr: float = 0.20) -> Tuple[np.ndarray, int]:
    """
    Umbraliza la respuesta de Harris y cuenta componentes conectados.
    Retorna (imagen_etiquetada, número_de_picos).

    Bug fix: si harris.max() == 0, toda la imagen sería "peak" con el umbral
    relativo → fallback a 0 picos para evitar falso positivo de decágono.
    """
    max_val = harris.max()
    if max_val == 0:
        return np.zeros_like(harris, dtype=np.int32), 0
    binary = (harris > max_val * rel_thr).astype(np.uint8)
    n_labels, labeled = cv2.connectedComponents(binary)
    return labeled, n_labels - 1   # label 0 = fondo


def _annulus_color(hsv: np.ndarray,
                   inner_frac: float,
                   outer_frac: float) -> Tuple[bool, bool]:
    """
    Analiza si la región anular de la imagen HSV es predominantemente
    dorada (H≈15–35, S>80, V>80) o plateada (S<50, V>100).

    inner_frac / outer_frac: fracción del radio de la imagen para delimitar
    la zona interior y exterior del anillo.

    Retorna (es_dorada, es_plateada).
    """
    h_img, w_img = hsv.shape[:2]
    cx, cy = w_img // 2, h_img // 2
    r_ref  = min(cx, cy)

    mask = np.zeros((h_img, w_img), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), int(r_ref * outer_frac), 255, -1)
    if inner_frac > 0:
        cv2.circle(mask, (cx, cy), int(r_ref * inner_frac), 0, -1)

    pix = hsv[mask == 255]
    if len(pix) == 0:
        return False, False

    H, S, V = pix[:, 0].astype(float), pix[:, 1].astype(float), pix[:, 2].astype(float)

    # Dorado: tono amarillo-naranja, saturación y valor altos
    gold_ratio   = float(np.mean((H >= 15) & (H <= 35) & (S > 80) & (V > 80)))
    # Plateado: baja saturación, valor alto (gris brillante)
    silver_ratio = float(np.mean((S < 50) & (V > 100)))

    return gold_ratio > 0.30, silver_ratio > 0.30


# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 2 — EXTRACCIÓN DE DIMENSIONES
# Binarización Otsu + Bounding Box + área real en px y mm².
# ═══════════════════════════════════════════════════════════════════════════════

def extract_dimensions(img: np.ndarray,
                       K: Optional[float] = None) -> Dict[str, Any]:
    """
    Extrae dimensiones del objeto principal en la imagen.

    Fórmulas (álgebra de coordenadas):
      Ancho_px  = X_max − X_min
      Alto_px   = Y_max − Y_min
      RA        = Ancho_px / Alto_px
      Área_mm²  = área_px × K²   (solo si K está disponible)

    K (mm/px) proviene del Bloque 1. Sin K, se retornan solo valores en px.
    El objeto principal es el contorno de mayor área tras la binarización.
    """
    gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur  = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return {}

    c          = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(c)

    # Área real: píxeles blancos rellenos dentro del contorno (no del bbox)
    mask = np.zeros_like(th)
    cv2.drawContours(mask, [c], -1, 255, cv2.FILLED)
    area_px = int(np.count_nonzero(mask))

    # RA = Alto / Ancho (convención h/w del spec: valor > 1 = producto más alto que ancho)
    ar = round(h / w, 3) if w > 0 else 0.0

    result: Dict[str, Any] = {
        "width_px":     int(w),
        "height_px":    int(h),
        "aspect_ratio": ar,
        "area_px":      area_px,
    }

    if K and K > 0:
        result["width_mm"]  = round(w       * K,    1)
        result["height_mm"] = round(h       * K,    1)
        result["area_mm2"]  = round(area_px * K**2, 1)

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 3 — IDENTIFICACIÓN POR DISTANCIA EUCLIDIANA
# Histograma HSV normalizado + d(P,Q) = √Σ(Pᵢ−Qᵢ)²
# ═══════════════════════════════════════════════════════════════════════════════

def color_signature(img: np.ndarray) -> np.ndarray:
    """
    Calcula el vector de firma de color basado en el histograma de Hue (18 bins).

    Solo canal H — normalizado L2. Canales V y S excluidos:
      - V: robusto frente a iluminación variable (indicado en spec)
      - S: varía por color (azul≈bin6, amarillo≈bin7) → causa falsos negativos
           cuando se compara contra vectores sintéticos de referencia.
           Incluir S cuando la DB tenga vectores de fotos reales.

    Para poblar la DB con vectores reales:
        entry["color_vector"] = color_signature(cv2.imread("producto_ref.jpg"))
    """
    hsv    = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h_hist = cv2.calcHist([hsv], [0], None, [_HUE_BINS], [0, 180]).flatten()
    vec    = h_hist.astype(np.float32)
    norm   = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


def euclidean_distance(p: np.ndarray, q: np.ndarray) -> float:
    """d(P, Q) = √ Σ (Pᵢ − Qᵢ)²"""
    return float(np.sqrt(np.sum((p - q) ** 2)))


def match_by_color(img: np.ndarray,
                   dimensions: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Compara el vector de color del producto contra PRODUCT_DB usando
    distancia euclidiana, con pre-filtro geométrico por relación de aspecto.

    Retorna el mejor match si su distancia es < COLOR_DIST_THRESHOLD,
    o None si ningún candidato pasa el umbral.
    """
    vec    = color_signature(img)
    best:   Optional[Dict] = None
    best_d: float          = float("inf")

    for pid, entry in PRODUCT_DB.items():
        if entry.get("color_vector") is None:
            continue

        # Pre-filtro: aspect ratio ± tolerancia
        ar_img = dimensions.get("aspect_ratio")
        ar_ref = entry.get("aspect_ratio")
        if ar_img and ar_ref:
            if abs(ar_img - ar_ref) > entry.get("ar_tol", 0.25):
                continue

        d = euclidean_distance(vec, entry["color_vector"])
        if d < best_d:
            best_d = d
            best   = {**entry, "product_id": pid, "color_distance": round(d, 4)}

    if best and best_d < COLOR_DIST_THRESHOLD:
        logger.debug("[COLOR] match=%s d=%.4f", best["product_id"], best_d)
        return best
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# BLOQUE 4 — VALIDACIÓN POR CORRELACIÓN CRUZADA NORMALIZADA (NCC)
#
# Gamma = Σ((A−Ā)·(B−B̄)) / √(Σ(A−Ā)² · Σ(B−B̄)²)
# Implementado con cv2.TM_CCOEFF_NORMED (equivalente matemático exacto).
# Gamma ∈ [−1, 1]; si Gamma ≥ gamma_threshold → identidad validada.
# ═══════════════════════════════════════════════════════════════════════════════

_LOGOS_DIR = os.path.join(os.path.dirname(__file__), "..", "logos")


def validate_logo(img: np.ndarray,
                  product_id: str,
                  gamma_threshold: float = 0.85) -> float:
    """
    Calcula el coeficiente Gamma de Correlación Cruzada Normalizada entre
    la imagen capturada y el template del logo almacenado.

    Si no existe un archivo de logo para el product_id, retorna 0.0
    (el bloque queda inactivo sin romper el pipeline).

    Para activar el bloque: coloca el logo en ai-service/logos/<product_id>.png
    """
    entry     = PRODUCT_DB.get(product_id, {})
    logo_rel  = entry.get("logo_path")
    logo_path = os.path.join(_LOGOS_DIR, logo_rel) if logo_rel else None

    if not logo_path or not os.path.isfile(logo_path):
        return 0.0

    template = cv2.imread(logo_path)
    if template is None:
        return 0.0

    gray_img  = cv2.cvtColor(img,      cv2.COLOR_BGR2GRAY) if img.ndim      == 3 else img
    gray_tmpl = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY) if template.ndim == 3 else template

    th, tw = gray_tmpl.shape[:2]
    ih, iw = gray_img.shape[:2]

    # El template debe ser ≤ imagen para matchTemplate
    if th > ih or tw > iw:
        scale     = min(ih / th, iw / tw) * 0.85
        gray_tmpl = cv2.resize(
            gray_tmpl,
            (max(1, int(tw * scale)), max(1, int(th * scale))),
        )

    result = cv2.matchTemplate(gray_img, gray_tmpl, cv2.TM_CCOEFF_NORMED)
    _, gamma, _, _ = cv2.minMaxLoc(result)
    logger.debug("[LOGO] product=%s gamma=%.3f thr=%.2f", product_id, gamma, gamma_threshold)
    return float(gamma)
