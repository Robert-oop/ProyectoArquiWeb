"""
reference_db.py — Identificación garantizada por imagen de referencia
======================================================================

CÓMO AGREGAR UN PRODUCTO:
  1. Copiar la(s) foto(s) en la carpeta:
         ai-service/reference_images/

  2. Agregar una entrada en REFERENCE_LABELS:
         "nombre_del_archivo.jpg": "Nombre del Producto",

  3. Reiniciar el container:
         docker compose restart ai-service

El mismo archivo subido como referencia dará siempre el nombre correcto.
Fotos distintas del mismo producto (mismo ángulo aproximado) también coincidirán.

Algoritmo: ORB keypoints + BFMatcher (Hamming)
  - No requiere ML extra — usa OpenCV puro
  - Foto idéntica → 200+ coincidencias
  - Foto parecida  →  30-100 coincidencias
  - Foto diferente → < 10 coincidencias (ignorado)
"""

import cv2
import numpy as np
import os
import threading
import logging
from typing import Dict, List, Optional

logger = logging.getLogger("stockai-ai.reference_db")

# ══════════════════════════════════════════════════════════════════════════════
#  ETIQUETAS DE REFERENCIA
#  Clave  = nombre del archivo dentro de la carpeta reference_images/
#  Valor  = nombre del producto que se mostrará en el sistema
# ══════════════════════════════════════════════════════════════════════════════
REFERENCE_LABELS: Dict[str, str] = {
    "entera.webp":                                    "COLUN Leche 1L",
    "pastosemi.png":                                  "COLUN Leche 1L",
    "semi.png":                                       "COLUN Leche Semidescremada 1L",
    "WhatsApp Image 2026-06-25 at 01.02.30.jpeg":     "COLUN Leche Semidescremada",
    "Mantequilla.jpg":                                "COLUN Mantequilla 250g",
    "AceiteOliva.webp":                               "Aceite Oliva EXTRA VIRGEN",
    "papas.webp":                                     "Lays Americano 150g",
    "WhatsApp Image 2026-06-25 at 19.56.41.jpeg":     "COLUN Mantequilla",
}

# ──────────────────────────────────────────────────────────────────────────────
_IMAGES_DIR       = os.path.join(os.path.dirname(__file__), "..", "reference_images")
_MIN_GOOD_MATCHES = 12      # mínimo de keypoints coincidentes para aceptar match
_ORB_NFEATURES    = 500     # keypoints ORB a detectar por imagen
_HAMMING_MAX      = 55      # distancia Hamming máxima para contar un match como bueno

_db:    List[Dict] = []
_lock               = threading.Lock()
_loaded             = False


def _load_all() -> None:
    """Precarga las imágenes de referencia y calcula sus descriptores ORB."""
    global _loaded
    img_dir = os.path.abspath(_IMAGES_DIR)

    if not os.path.isdir(img_dir):
        logger.info("[REF] Carpeta reference_images/ no encontrada")
        _loaded = True
        return

    if not REFERENCE_LABELS:
        logger.info("[REF] REFERENCE_LABELS vacío — sin imágenes de referencia")
        _loaded = True
        return

    orb      = cv2.ORB_create(nfeatures=_ORB_NFEATURES)
    n_loaded = 0

    for filename, product_name in REFERENCE_LABELS.items():
        path = os.path.join(img_dir, filename)
        if not os.path.isfile(path):
            logger.warning("[REF] No encontrado: %s", filename)
            continue

        img = cv2.imread(path)
        if img is None:
            logger.warning("[REF] No se pudo leer: %s", filename)
            continue

        gray      = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        kp, desc  = orb.detectAndCompute(gray, None)

        if desc is None or len(kp) < 10:
            logger.warning("[REF] Muy pocos keypoints en %s (%d)", filename, len(kp) if kp else 0)
            continue

        _db.append({
            "product_name": product_name,
            "filename":     filename,
            "descriptors":  desc,
        })
        n_loaded += 1
        logger.info("[REF] ✓ %s → '%s' (%d keypoints)", filename, product_name, len(kp))

    logger.info("[REF] %d imagen(es) de referencia cargada(s)", n_loaded)
    _loaded = True


def _ensure_loaded() -> None:
    global _loaded
    if not _loaded:
        with _lock:
            if not _loaded:
                _load_all()


def match(img_bgr: np.ndarray) -> Optional[str]:
    """
    Compara img_bgr contra todas las imágenes de referencia.

    Retorna el nombre del producto si hay ≥ _MIN_GOOD_MATCHES keypoints
    coincidentes con baja distancia Hamming, o None si no hay match.
    """
    _ensure_loaded()

    if not _db:
        return None

    orb       = cv2.ORB_create(nfeatures=_ORB_NFEATURES)
    gray      = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    kp_q, desc_q = orb.detectAndCompute(gray, None)

    if desc_q is None or len(kp_q) < 5:
        return None

    bf         = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    best_name  = None
    best_count = 0

    for entry in _db:
        try:
            raw  = bf.match(desc_q, entry["descriptors"])
            good = [m for m in raw if m.distance <= _HAMMING_MAX]
            if len(good) > best_count:
                best_count = len(good)
                best_name  = entry["product_name"]
        except Exception:
            continue

    if best_count >= _MIN_GOOD_MATCHES:
        logger.info("[REF] Match: '%s' (%d coincidencias)", best_name, best_count)
        return best_name

    logger.debug("[REF] Sin match (mejor=%d, umbral=%d)", best_count, _MIN_GOOD_MATCHES)
    return None
