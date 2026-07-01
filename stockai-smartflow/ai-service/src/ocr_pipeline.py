"""
ocr_pipeline.py — Pipeline de OCR para identificación de productos
===================================================================
Arquitectura en 6 etapas:

  1. Normalización de escala   — redimensiona al rango [800, 1400] px
  2. Segmentación del ROI      — Canny + contornos filtrados (área / aspect ratio)
  3. Extracción OCR            — EasyOCR (CRAFT detector + CRNN reconocedor)
  4. Priorización              — Score = 0.40·Tamaño + 0.35·Posición + 0.15·Contraste + 0.10·Frecuencia
  5. Clasificación             — Marca · Nombre Comercial · Variante · Secundario
  6. Match catálogo            — RapidFuzz WRatio / difflib fallback

  Categoría: CLIP ViT-B/32 zero-shot (carga perezosa, opcional)

Eliminado respecto a la versión anterior:
  - Tesseract + pytesseract (reemplazado por EasyOCR)
  - _correct_perspective, _quad_is_rectangular, _order_points, _four_point_transform
  - preprocess() (binarización adaptativa + bilateral) — EasyOCR no lo necesita
  - _parse_tess_data(), _merge_word_runs() (no aplica a EasyOCR)
  - Múltiples modos PSM — EasyOCR gestiona orientación internamente
"""
import cv2
import numpy as np
import re
import threading
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("stockai-ai.ocr_pipeline")

try:
    from rapidfuzz import fuzz as _rf_fuzz, process as _rf_process
    _HAS_RAPIDFUZZ = True
except ImportError:
    _HAS_RAPIDFUZZ = False


# ══════════════════════════════════════════════════════════════════════════════
# Singletons de modelos ML (inicialización perezosa, thread-safe)
# ══════════════════════════════════════════════════════════════════════════════

_easyocr_reader: Any = None
_easyocr_lock        = threading.Lock()

_clip_tried          = False
_clip_model: Any     = None
_clip_processor: Any = None
_clip_lock           = threading.Lock()


def _get_easyocr() -> Any:
    global _easyocr_reader
    if _easyocr_reader is None:
        with _easyocr_lock:
            if _easyocr_reader is None:
                import easyocr
                logger.info("[OCR] Inicializando EasyOCR (primera vez, puede tardar ~30s)...")
                _easyocr_reader = easyocr.Reader(
                    ["es", "en"],
                    gpu=False,
                    verbose=False,
                )
                logger.info("[OCR] EasyOCR listo")
    return _easyocr_reader


def _get_clip() -> Tuple[Any, Any]:
    global _clip_tried, _clip_model, _clip_processor
    if not _clip_tried:
        with _clip_lock:
            if not _clip_tried:
                _clip_tried = True
                try:
                    from transformers import CLIPModel, CLIPProcessor
                    logger.info("[CLIP] Cargando modelo ViT-B/32...")
                    _clip_processor = CLIPProcessor.from_pretrained(
                        "openai/clip-vit-base-patch32"
                    )
                    _clip_model = CLIPModel.from_pretrained(
                        "openai/clip-vit-base-patch32",
                        use_safetensors=True,
                    )
                    logger.info("[CLIP] Modelo listo")
                except Exception as exc:
                    logger.warning("[CLIP] No disponible: %s", exc)
    return _clip_model, _clip_processor


def preload_models() -> None:
    """Pre-carga EasyOCR y CLIP para reducir latencia de la primera solicitud."""
    logger.info("[OCR] Pre-cargando modelos ML...")
    _get_easyocr()
    _get_clip()
    logger.info("[OCR] Modelos pre-cargados")


# ══════════════════════════════════════════════════════════════════════════════
# Constantes
# ══════════════════════════════════════════════════════════════════════════════

_MIN_OCR_DIM      = 800
_MAX_OCR_DIM      = 1400
_MIN_WORD_CONF    = 0.20        # EasyOCR retorna confianza en [0, 1]
_FUZZY_THRESHOLD  = 45
_SCORE_MIN        = 0.20
_MAX_NAME_WORDS   = 3

_SKIP_WORDS = re.compile(
    r"^(LOT|LOTE|BATCH|VENC|VENCE|CAD|EXP|MFG|FECHA|BEST|USE|BY|"
    r"NET|PESO|WEIGHT|CONT|REG|INGR|FAB|ML|KG|GR|MG|LT|CC|MM|CM|"
    r"www|http|S\.A\.|SPA|LTDA|INC|LLC|CORP)[\.:]?$",
    re.IGNORECASE,
)
_DATE_LIKE        = re.compile(r"^\d{1,4}[/\-\.]\d{1,4}([/\-\.]\d{2,4})?$")
_ONLY_DIGITS_LONG = re.compile(r"^\d{6,}$")
_PERCENT_CLAIM    = re.compile(r"^\d+%$")
_UNIT_PATTERN     = re.compile(r"^\d+(\.\d+)?\s*[mMlLgGkKcC][lLgG]?$")

# Pares (etiqueta, descripción) para clasificación CLIP zero-shot
_CLIP_CATEGORIES: List[Tuple[str, str]] = [
    ("lácteos",           "producto lácteo: leche, yogur, mantequilla, queso, crema"),
    ("bebidas gaseosas",  "bebida gaseosa, refresco, cola, soda, bebida carbonatada"),
    ("aguas y jugos",     "agua embotellada, jugo de fruta, néctar, bebida de fruta"),
    ("conservas",         "alimento enlatado: conservas, atún, tomates, legumbres"),
    ("snacks",            "papas fritas, galletas, chocolates, dulces, confites"),
    ("cereales",          "arroz, avena, harina, cereal, pan de molde"),
    ("limpieza",          "producto de limpieza: detergente, jabón, cloro, desengrasante"),
    ("cuidado personal",  "shampoo, acondicionador, crema, desodorante, cuidado personal"),
    ("otros",             "otro producto envasado, alimento no clasificado"),
]


# ══════════════════════════════════════════════════════════════════════════════
# ETAPA 1 — NORMALIZACIÓN DE ESCALA
# ══════════════════════════════════════════════════════════════════════════════

def _normalize_scale(gray: np.ndarray) -> np.ndarray:
    """
    Normaliza al rango [_MIN_OCR_DIM, _MAX_OCR_DIM] px en el eje mayor.
    Sube imágenes pequeñas (< 800px) y baja imágenes de smartphone (> 1400px).
    """
    h, w  = gray.shape
    max_d = max(h, w)
    if _MIN_OCR_DIM <= max_d <= _MAX_OCR_DIM:
        return gray
    target = _MIN_OCR_DIM if max_d < _MIN_OCR_DIM else _MAX_OCR_DIM
    scale  = target / max_d
    new_w  = max(1, int(w * scale))
    new_h  = max(1, int(h * scale))
    interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    return cv2.resize(gray, (new_w, new_h), interpolation=interp)


# ══════════════════════════════════════════════════════════════════════════════
# ETAPA 2 — SEGMENTACIÓN DEL ROI
# ══════════════════════════════════════════════════════════════════════════════

def segment_label(
    gray: np.ndarray,
) -> Tuple[Optional[np.ndarray], Optional[Tuple[int, int, int, int]]]:
    """
    Detecta la región del producto mediante Canny + contornos.

    Criterio compuesto (mismo que versión anterior, sin binary):
      - área     >= 8%  del frame
      - ancho BB >= 20% del ancho
      - alto  BB >= 20% del alto
      - aspect   <= 4.5 (descarta logos horizontales, ej: óvalo Colun 6.4:1)
      - área     <= 90% del frame (descarta el fondo completo)

    Padding 5% para no cortar texto en los bordes del ROI.
    Retorna (roi_gray, (x0, y0, w, h)) o (None, None).
    """
    h, w = gray.shape
    blur    = cv2.GaussianBlur(gray, (5, 5), 0)
    edges   = cv2.Canny(blur, 50, 150)
    kernel  = np.ones((5, 5), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    valid = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < h * w * 0.08:
            continue
        _, _, cw, ch = cv2.boundingRect(c)
        if cw < w * 0.20 or ch < h * 0.20:
            continue
        if cw / max(1, ch) > 4.5 or ch / max(1, cw) > 4.5:
            continue
        if cw * ch > h * w * 0.90:
            continue
        valid.append(c)

    if not valid:
        return None, None

    c = max(valid, key=cv2.contourArea)
    x, y, cw, ch = cv2.boundingRect(c)

    pad_x = max(5, int(cw * 0.05))
    pad_y = max(5, int(ch * 0.05))
    x0 = max(0, x - pad_x);       y0 = max(0, y - pad_y)
    x1 = min(w, x + cw + pad_x);  y1 = min(h, y + ch + pad_y)

    roi  = gray[y0:y1, x0:x1]
    bbox = (x0, y0, x1 - x0, y1 - y0)
    return roi, bbox


# ══════════════════════════════════════════════════════════════════════════════
# ETAPA 3 — EXTRACCIÓN OCR (EasyOCR)
# ══════════════════════════════════════════════════════════════════════════════

def extract_words(img: np.ndarray) -> List[Dict[str, Any]]:
    """
    Extrae palabras con posición y confianza usando EasyOCR (CRAFT + CRNN).

    EasyOCR funciona directamente sobre la imagen BGR sin binarización previa.
    Detecta texto en cualquier ángulo, sobre fondos de colores y con compresión JPEG.

    Retorna lista de dicts con keys: text, x, y, w, h, conf [0-100], freq, score.
    conf se normaliza a [0, 100] para compatibilidad con score_words().
    """
    reader = _get_easyocr()

    try:
        results = reader.readtext(img, detail=1, paragraph=False)
    except Exception as exc:
        logger.error("[OCR] EasyOCR error: %s", exc)
        return []

    words: List[Dict[str, Any]] = []
    for (bbox, text, conf) in results:
        text = text.strip()
        if not text or conf < _MIN_WORD_CONF:
            continue
        if _SKIP_WORDS.match(text):
            continue
        if _DATE_LIKE.match(text) or _ONLY_DIGITS_LONG.match(text) or _PERCENT_CLAIM.match(text):
            continue
        if not any(c.isalnum() for c in text):
            continue
        if len(text) < 2:
            continue

        # EasyOCR bbox: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] (4 esquinas, sentido horario)
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        x0 = int(min(xs));  y0 = int(min(ys))
        bw = int(max(xs) - min(xs))
        bh = int(max(ys) - min(ys))

        words.append({
            "text":  text,
            "x":     x0,
            "y":     y0,
            "w":     bw,
            "h":     bh,
            "conf":  int(conf * 100),
            "freq":  1,
            "score": 0.0,
        })

    return words


# ══════════════════════════════════════════════════════════════════════════════
# CATEGORÍA — CLIP ZERO-SHOT
# ══════════════════════════════════════════════════════════════════════════════

def _clip_categorize(img_bgr: np.ndarray) -> Optional[str]:
    """
    Clasifica el producto en una categoría usando CLIP ViT-B/32 zero-shot.

    Compara el embedding de la imagen con las descripciones de _CLIP_CATEGORIES
    y retorna la etiqueta de mayor similitud coseno.
    Retorna None si CLIP no está disponible o la probabilidad máxima < 15%.
    """
    try:
        model, processor = _get_clip()
        if model is None or processor is None:
            return None

        import torch
        from PIL import Image

        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)

        descriptions = [desc for _, desc in _CLIP_CATEGORIES]
        inputs = processor(
            text=descriptions,
            images=pil_img,
            return_tensors="pt",
            padding=True,
            truncation=True,
        )

        with torch.no_grad():
            outputs  = model(**inputs)
            probs    = outputs.logits_per_image.softmax(dim=1)[0]

        best_idx  = probs.argmax().item()
        best_prob = probs[best_idx].item()

        if best_prob < 0.15:
            return None

        label = _CLIP_CATEGORIES[best_idx][0]
        logger.debug("[CLIP] categoría=%s prob=%.2f", label, best_prob)
        return label

    except Exception as exc:
        logger.warning("[CLIP] Error en categorización: %s", exc)
        return None


# ══════════════════════════════════════════════════════════════════════════════
# ETAPA 4 — PRIORIZACIÓN DE PALABRAS
# ══════════════════════════════════════════════════════════════════════════════

def score_words(
    words:  List[Dict[str, Any]],
    img_h:  int,
    img_w:  int,
    n_runs: int,
) -> List[Dict[str, Any]]:
    """
    Score = 0.40·Tamaño + 0.35·Posición + 0.15·Contraste + 0.10·Frecuencia

    Tamaño    (0.40) — alto de la palabra vs 15% del frame. Marca/nombre = letras grandes.
    Posición  (0.35) — tercio superior puntúa más. Marca en la parte alta del envase.
    Contraste (0.15) — confianza EasyOCR normalizada [0,1].
    Frecuencia(0.10) — siempre 1 con EasyOCR (un solo pase); componente uniforme.
    """
    if not words or img_h == 0 or img_w == 0:
        return words

    ref_h    = max(1.0, img_h * 0.15)
    min_name = img_h * 0.03

    for w in words:
        w["is_small"]  = w["h"] < min_name
        size_s         = min(1.0, w["h"] / ref_h)
        pos_s          = 1.0 - min(1.0, w["y"] / img_h)
        contrast_s     = w["conf"] / 100.0
        freq_s         = min(1.0, w["freq"] / max(1, n_runs))

        w["score"] = round(
            0.40 * size_s     +
            0.35 * pos_s      +
            0.15 * contrast_s +
            0.10 * freq_s,
            4,
        )

    return sorted(words, key=lambda x: x["score"], reverse=True)


# ══════════════════════════════════════════════════════════════════════════════
# ETAPA 5 — CLASIFICACIÓN DE PALABRAS
# ══════════════════════════════════════════════════════════════════════════════

def classify_words(scored_words: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    brand           → palabra con mayor score ≥ 0.50
    commercial_name → palabras score ≥ 0.38, ordenadas por posición (y, x)
    variant         → palabras score ≥ 0.25 (unidades de medida incluidas)
    secondary       → resto (texto pequeño, baja confianza)
    """
    empty = {"brand": None, "commercial_name": None, "variant": None, "secondary": []}
    if not scored_words:
        return empty

    valid = [w for w in scored_words if w["score"] >= _SCORE_MIN]
    if not valid:
        valid = scored_words[:3]

    brand:     Optional[str] = None
    name_dcts: List[Dict]    = []
    var_dcts:  List[Dict]    = []
    secondary: List[str]     = []

    for i, w in enumerate(valid):
        txt = w["text"]
        s   = w["score"]

        if len(txt) < 2 or w.get("is_small"):
            secondary.append(txt)
            continue

        if _UNIT_PATTERN.match(txt):
            var_dcts.append(w)
            continue

        if i == 0 and s >= 0.50:
            brand = txt
        elif s >= 0.38 and len(name_dcts) < _MAX_NAME_WORDS:
            name_dcts.append(w)
        elif s >= 0.25:
            var_dcts.append(w)
        else:
            secondary.append(txt)

    name_dcts.sort(key=lambda w: (w["y"], w["x"]))
    var_dcts.sort(key=lambda w: (w["y"], w["x"]))

    return {
        "brand":           brand,
        "commercial_name": " ".join(w["text"] for w in name_dcts) if name_dcts else None,
        "variant":         " ".join(w["text"] for w in var_dcts) if var_dcts else None,
        "secondary":       secondary,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ETAPA 6 — MATCH CON CATÁLOGO
# ══════════════════════════════════════════════════════════════════════════════

def fuzzy_match_catalog(
    text:    str,
    catalog: Dict[str, str],
) -> Optional[Dict[str, Any]]:
    """
    RapidFuzz WRatio con fallback a difflib.SequenceMatcher.
    Retorna el mejor match si supera _FUZZY_THRESHOLD (0–100), o None.
    """
    if not text or not catalog:
        return None

    clean = text.strip()

    if _HAS_RAPIDFUZZ:
        results = _rf_process.extract(
            clean,
            list(catalog.keys()),
            scorer=_rf_fuzz.WRatio,
            limit=3,
        )
        if results and results[0][1] >= _FUZZY_THRESHOLD:
            name, score, _ = results[0]
            return {
                "display_name": name,
                "product_id":   catalog[name],
                "score":        round(score / 100.0, 3),
                "method":       "rapidfuzz",
            }
    else:
        from difflib import SequenceMatcher
        best_name  = None
        best_ratio = 0.0
        for name in catalog:
            ratio = SequenceMatcher(None, clean.lower(), name.lower()).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_name  = name
        if best_name and best_ratio * 100 >= _FUZZY_THRESHOLD:
            return {
                "display_name": best_name,
                "product_id":   catalog[best_name],
                "score":        round(best_ratio, 3),
                "method":       "difflib",
            }

    return None


# ══════════════════════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

def run(
    img:     np.ndarray,
    catalog: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Pipeline completo OCR + CLIP sobre imagen BGR.

    Retorna:
        full_text      — texto en orden de lectura natural
        words          — palabras con score, posición y confianza
        classified     — {brand, commercial_name, variant, secondary}
        catalog_match  — {display_name, product_id, score, method} o None
        ocr_confidence — promedio confianza top-5 palabras [0,1]
        label_bbox     — (x,y,w,h) del ROI detectado o None
        category       — categoría CLIP o None
    """
    empty_result: Dict[str, Any] = {
        "full_text":      "",
        "words":          [],
        "classified":     {"brand": None, "commercial_name": None,
                           "variant": None, "secondary": []},
        "catalog_match":  None,
        "ocr_confidence": 0.0,
        "label_bbox":     None,
        "category":       None,
    }

    if img is None or img.size == 0:
        return empty_result

    # 1. Normalizar escala (en gray para segmentación)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img.copy()
    gray = _normalize_scale(gray)

    # Ajustar BGR a las mismas dimensiones que el gray normalizado
    if gray.shape[:2] != img.shape[:2]:
        h, w = gray.shape[:2]
        img = cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA)

    # 2. Segmentación del ROI
    _, label_bbox = segment_label(gray)
    if label_bbox is not None:
        x0b, y0b, bw, bh = label_bbox
        img_ocr = img[y0b : y0b + bh, x0b : x0b + bw]
    else:
        img_ocr = img

    # 3. EasyOCR — opera sobre imagen BGR directamente
    words = extract_words(img_ocr)

    if not words:
        logger.debug("[OCR] ninguna palabra detectada")
        return {**empty_result, "label_bbox": label_bbox}

    # 4. Priorización
    h_t, w_t = img_ocr.shape[:2]
    words     = score_words(words, h_t, w_t, n_runs=1)

    # Texto completo en orden de lectura (Y ascendente, X ascendente)
    words_by_pos = sorted(words, key=lambda w: (w["y"], w["x"]))
    full_text    = " ".join(w["text"] for w in words_by_pos)

    # 5. Clasificación
    classified = classify_words(words)

    # 6. Match catálogo
    _brand_txt = classified.get("brand")
    _comm_txt  = classified.get("commercial_name")
    catalog_match = (
        fuzzy_match_catalog(_brand_txt, catalog or {}) or
        (fuzzy_match_catalog(_comm_txt, catalog or {}) if _comm_txt else None)
    )

    # Confianza OCR: promedio top-5 palabras por score
    top5     = words[:5]
    ocr_conf = float(np.mean([w["conf"] for w in top5])) / 100.0 if top5 else 0.0

    # CLIP — categoría del producto (sobre imagen BGR completa normalizada)
    category = _clip_categorize(img)

    logger.debug(
        "[OCR] palabras=%d ocr_conf=%.2f brand=%s catalog=%s cat=%s",
        len(words), ocr_conf,
        classified.get("brand"),
        catalog_match["display_name"] if catalog_match else None,
        category,
    )

    return {
        "full_text":      full_text,
        "words":          words,
        "classified":     classified,
        "catalog_match":  catalog_match,
        "ocr_confidence": round(ocr_conf, 3),
        "label_bbox":     label_bbox,
        "category":       category,
    }
