"""
ai-service/src/identifier.py
─────────────────────────────
Motor de visión principal — orquesta el pipeline completo de identificación.

Pipeline:
  1. Barcode / QR          — OpenCV BarcodeDetector
  2. Calibración (B1)      — Moneda de referencia → K mm/px
  3. Dimensiones   (B2)    — Bounding box + área real
  4. OCR estructurado      — ocr_pipeline.run() (preproceso + segmentación + scoring)
  5. Fecha / Lote          — regex sobre full_text
  6. Color match   (B3)    — Histograma HSV + distancia euclidiana
  7. Logo NCC      (B4)    — Correlación cruzada normalizada
  8. Confianza final       — ConfianzaFinal = 0.5·OCR + 0.3·Visual + 0.2·Catálogo
"""
import cv2
import numpy as np
import re
from datetime import datetime
from typing   import Any, Dict, List, Optional

import src.vision_math  as vm
import src.ocr_pipeline as ocr_pipeline
import src.reference_db as reference_db

# Catálogo local para fuzzy matching: { "Nombre Display" → "product_id" }
# Se construye desde vision_math.PRODUCT_DB y puede extenderse en runtime.
CATALOG: Dict[str, str] = {
    entry["display_name"]: pid
    for pid, entry in vm.PRODUCT_DB.items()
}


class ProductIdentifier:

    # Patrón de fecha sin separador: riesgo de falsos positivos con barcodes.
    # Se usa SOLO como último recurso, después de los patrones con separadores.
    _DATE_PATTERNS = [
        (r"\b(\d{2})[/\-\.](\d{2})[/\-\.](\d{4})\b", "dmy"),
        (r"\b(\d{4})[/\-\.](\d{2})[/\-\.](\d{2})\b", "ymd"),
        (r"\b(\d{2})[/\-\.](\d{4})\b",                "my"),
        # ⚠ Sin separador: aplica solo si no se encontró nada con los anteriores
        (r"\b(\d{2})(\d{2})(\d{4})\b",                "dmy_nosep"),
    ]

    def __init__(self) -> None:
        try:
            self._barcode     = cv2.barcode.BarcodeDetector()
            self._has_barcode = True
        except AttributeError:
            self._has_barcode = False

    # ── Pipeline principal ────────────────────────────────────────────────────

    def identify(self, image_bytes: bytes,
                 content_type: str = "image/jpeg") -> Dict[str, Any]:
        img = self._decode(image_bytes)
        if img is None:
            return self._empty()

        # Paso 1 — Barcode / QR
        barcode = self._read_barcode(img)

        # Paso 2 — Imagen de referencia etiquetada (máxima prioridad para demo/productos conocidos)
        ref_name = reference_db.match(img)
        if ref_name:
            return {
                "detected":         True,
                "confidence":       0.95,
                "product_name":     ref_name,
                "sku_guess":        barcode,
                "barcode":          barcode,
                "expiry_date":      None,
                "lot_number":       None,
                "bounding_box":     None,
                "brand_guess":      None,
                "brand_confidence": None,
                "scale_k":          None,
                "dimensions":       None,
                "identified_text":  {"brand": ref_name.split()[0], "commercial_name": ref_name,
                                     "variant": None, "secondary": []},
                "catalog_match":    None,
                "ocr_confidence":   0.95,
                "category":         None,
            }

        # Paso 3 — Calibración por moneda → K mm/px (B1)
        K = vm.detect_coin(img)

        # Paso 4 — Dimensiones del producto (B2)
        dimensions = vm.extract_dimensions(img, K)

        # Paso 4 — Pipeline OCR estructurado
        ocr = ocr_pipeline.run(img, CATALOG)
        full_text     = ocr["full_text"]
        classified    = ocr["classified"]
        catalog_match = ocr["catalog_match"]
        ocr_conf      = ocr["ocr_confidence"]
        category      = ocr.get("category")

        # Paso 5 — Fecha de vencimiento y lote (regex sobre full_text)
        expiry = self._parse_date(full_text)
        lot    = self._extract_lot(full_text)

        # Nombre del producto: se construye combinando brand + commercial_name
        # para que imágenes de diferentes ángulos del mismo envase retornen
        # el mismo nombre completo (ej: "Colun Leche Semidescremada").
        # El catálogo solo actúa como override si el match supera el umbral.
        product_name = self._build_product_name(classified, catalog_match)

        # Paso 6 — Color match + dimensiones (B3)
        brand_match = vm.match_by_color(img, dimensions)
        brand_name  = brand_match["display_name"] if brand_match else None

        # Paso 7 — Validación de logo NCC (B4)
        gamma = 0.0
        if brand_match:
            gamma = vm.validate_logo(img, brand_match["product_id"])

        # Paso 8 — Confianza final según spec:
        # ConfianzaFinal = 0.5·OCR + 0.3·CaracterísticasVisuales + 0.2·Catálogo
        visual_conf  = self._visual_confidence(barcode, brand_match, gamma)
        catalog_conf = catalog_match["score"] if catalog_match else 0.0

        confidence = round(
            0.5  * ocr_conf    +
            0.3  * visual_conf +
            0.2  * catalog_conf,
            4,
        )

        # Si hay barcode → identificación directa.
        # Si OCR encontró un nombre con buena confianza → detectado aunque no esté en catálogo.
        # Productos fuera del catálogo tienen visual_conf=0 y catalog_conf=0, por lo que
        # confidence = 0.5 * ocr_conf (máximo ≈ 0.50). El umbral de 0.3 requeriría ocr_conf > 0.6.
        # Con ocr_conf ≥ 0.45 y product_name no nulo, el OCR identificó el producto claramente.
        has_ocr_name = bool(product_name) and ocr_conf >= 0.45
        detected = confidence > 0.3 or bool(barcode) or has_ocr_name

        # Si product_name vacío, usar brand_name como respaldo final
        name = product_name or brand_name

        return {
            # Señales base
            "detected":          detected,
            "confidence":        confidence,
            "product_name":      name,
            "sku_guess":         barcode,
            "barcode":           barcode,
            "expiry_date":       expiry,
            "lot_number":        lot,
            "bounding_box":      None,
            # Bloques visuales (B1–B4)
            "brand_guess":       brand_name,
            "brand_confidence":  self._brand_conf(brand_match, gamma),
            "scale_k":           round(K, 6) if K else None,
            "dimensions":        dimensions or None,
            # Campos OCR estructurado
            "identified_text":   classified,
            "catalog_match":     catalog_match["display_name"] if catalog_match else None,
            "ocr_confidence":    ocr_conf,
            "category":          category,
        }

    # ── Construcción del nombre de producto ──────────────────────────────────

    @staticmethod
    def _build_product_name(
        classified:    Dict[str, Any],
        catalog_match: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        """
        Construye el nombre del producto combinando señales OCR + catálogo.

        Prioridad:
          1. Catálogo (fuzzy match de alta confianza ≥ 0.70) → nombre normalizado
          2. OCR: brand + commercial_name combinados, con título (Title Case)
          3. Solo brand si no hay commercial_name
          4. None si OCR no detectó nada

        Se combina brand + commercial_name para que "COLUN" + "LECHE SEMIDESCREMADA"
        resulte en "Colun Leche Semidescremada" de forma consistente entre imágenes
        del mismo producto tomadas desde distintos ángulos.
        """
        brand    = (classified.get("brand") or "").strip()
        comm     = (classified.get("commercial_name") or "").strip()
        variant  = (classified.get("variant") or "").strip()

        # 1. Catálogo con confianza alta + verificación de que la marca OCR aparece en el match.
        # Threshold 0.80 previene falsos positivos cuando el catalog es pequeño y comparte
        # tokens comunes (ej: "1L") con el query. La validación de marca evita que
        # "COLUN LECHE 1L" matchee "Caja Jugo 1L" aunque el score sea alto.
        if catalog_match and catalog_match.get("score", 0) >= 0.80:
            brand_in_match = (
                not brand or
                brand.lower() in catalog_match["display_name"].lower()
            )
            if brand_in_match:
                return catalog_match["display_name"]

        # Construir nombre: brand + commercial_name (sin variant).
        # El variant queda disponible en identified_text.variant — no se incluye en el
        # nombre porque puede contener ruido ("100% Natural Reconstituida No") cuando
        # el catálogo es pequeño. Las unidades (1L, 500ml) sí se preservan como variant.
        if comm.upper().startswith(brand.upper()):
            parts = [comm]
        else:
            parts = [p for p in [brand, comm] if p]

        if not parts:
            return None

        combined = " ".join(parts)
        return ProductIdentifier._normalize_name(combined)

    @staticmethod
    def _normalize_name(text: str) -> str:
        """
        Convierte texto OCR en mayúsculas a título legible.
        Mantiene siglas conocidas en mayúsculas (SPA, UHT, INC, etc.).
        """
        _KEEP_UPPER = {"UHT", "SPA", "LTDA", "S.A.", "INC", "LLC", "1L", "2L",
                       "500ML", "250ML", "1KG", "500G", "200G"}
        words = text.split()
        result = []
        for w in words:
            if w.upper() in _KEEP_UPPER:
                result.append(w.upper())
            else:
                result.append(w.capitalize())
        return " ".join(result)

    # ── Utilidades ─────────────────────────────────────────────────────────────

    def _decode(self, data: bytes) -> Optional[np.ndarray]:
        arr = np.frombuffer(data, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)

    def _read_barcode(self, img: np.ndarray) -> Optional[str]:
        if not self._has_barcode:
            return None
        try:
            retval, decoded_info, _, _ = self._barcode.detectAndDecodeWithType(img)
            if retval and decoded_info:
                code = decoded_info[0].strip()
                return code if code else None
        except Exception:
            pass
        return None

    def _parse_date(self, text: str) -> Optional[str]:
        """
        Extrae la primera fecha futura del texto OCR.

        Los patrones con separador (/, -, .) tienen prioridad.
        El patrón sin separador se aplica solo si los anteriores no retornan nada
        para reducir falsos positivos con números de barcode de 8 dígitos.
        """
        if not text:
            return None

        now = datetime.now()
        found_with_sep: Optional[str] = None

        for pat, fmt in self._DATE_PATTERNS:
            # Patrón sin separador: solo si todavía no encontramos nada
            if fmt == "dmy_nosep" and found_with_sep:
                break

            for m in re.finditer(pat, text):
                g = m.groups()
                try:
                    if fmt in ("dmy", "dmy_nosep"):
                        dt = datetime(int(g[2]), int(g[1]), int(g[0]))
                    elif fmt == "ymd":
                        dt = datetime(int(g[0]), int(g[1]), int(g[2]))
                    else:  # my
                        dt = datetime(int(g[1]), int(g[0]), 1)

                    if dt > now:
                        result = dt.strftime("%Y-%m-%d")
                        if fmt != "dmy_nosep":
                            found_with_sep = result
                        return result
                except (ValueError, OverflowError):
                    continue

        return found_with_sep

    def _extract_lot(self, text: str) -> Optional[str]:
        if not text:
            return None
        m = re.search(r"\b(L\d{4}-\d{3,}|LOT[EO]?[:\s]*\w{3,})\b", text, re.IGNORECASE)
        return m.group(0).strip() if m else None

    # ── Score y confianza ─────────────────────────────────────────────────────

    @staticmethod
    def _visual_confidence(
        barcode:     Optional[str],
        brand_match: Optional[Dict],
        gamma:       float,
    ) -> float:
        """
        Calcula la confianza de las características visuales [0,1].

        Barcode → 1.0 (identificación directa).
        Sin barcode → color_match (B3) + logo gamma (B4) ponderados.
        """
        if barcode:
            return 1.0
        color_c = 0.0
        if brand_match:
            d       = brand_match.get("color_distance", 1.0)
            color_c = max(0.0, 1.0 - d / vm.COLOR_DIST_THRESHOLD)
        return min(1.0, color_c * 0.70 + gamma * 0.30)

    @staticmethod
    def _brand_conf(
        brand_match: Optional[Dict],
        gamma:       float,
    ) -> Optional[float]:
        """Confianza de identificación de marca: color (B3) + logo NCC (B4)."""
        if not brand_match:
            return None
        d       = brand_match.get("color_distance", 1.0)
        color_c = max(0.0, 1.0 - d / vm.COLOR_DIST_THRESHOLD)
        return round(color_c * 0.70 + gamma * 0.30, 3)

    @staticmethod
    def _empty() -> Dict[str, Any]:
        return {
            "detected": False,       "confidence": 0.0,
            "product_name": None,    "sku_guess": None,
            "barcode": None,         "expiry_date": None,
            "lot_number": None,      "bounding_box": None,
            "brand_guess": None,     "brand_confidence": None,
            "scale_k": None,         "dimensions": None,
            "identified_text": None, "catalog_match": None,
            "ocr_confidence": 0.0,   "category": None,
        }
