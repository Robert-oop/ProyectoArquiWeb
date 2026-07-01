"""
ai-service/src/schemas.py — Pydantic models para el endpoint /identify.
"""
from pydantic import BaseModel
from typing   import Any, Dict, Optional


class IdentifyResponse(BaseModel):
    # ── Identificación base ───────────────────────────────────────────────────
    detected:     bool
    confidence:   float           # ConfianzaFinal = 0.5·OCR + 0.3·Visual + 0.2·Catálogo
    product_name: Optional[str]  = None   # mejor nombre disponible (OCR > catálogo > color)
    sku_guess:    Optional[str]  = None   # barcode leído
    barcode:      Optional[str]  = None
    expiry_date:  Optional[str]  = None   # YYYY-MM-DD
    lot_number:   Optional[str]  = None
    bounding_box: Optional[Dict[str, Any]] = None

    # ── Bloques visuales B1–B4 ────────────────────────────────────────────────
    brand_guess:      Optional[str]          = None   # match por color/geometría
    brand_confidence: Optional[float]        = None   # confianza color + logo NCC
    scale_k:          Optional[float]        = None   # K mm/px (None sin moneda)
    dimensions:       Optional[Dict[str, Any]] = None # width/height px + mm si hay K

    # ── OCR estructurado (Etapas 4–6 del pipeline) ───────────────────────────
    identified_text: Optional[Dict[str, Any]] = None
    # Estructura: { brand, commercial_name, variant, secondary: [] }

    catalog_match:   Optional[str]   = None   # display_name del match en catálogo
    ocr_confidence:  Optional[float] = None   # promedio confianza EasyOCR top-5 [0,1]
    category:        Optional[str]   = None   # categoría CLIP zero-shot (lácteos, bebidas…)
