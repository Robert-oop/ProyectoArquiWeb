"""
StockAI — Motor de Visión Artificial  |  core_cv/detector.py
=============================================================
Servicio de identificación de productos lácteos por imagen.
Stack: OpenCV (cv2) + NumPy + FastAPI (expuesto como microservicio en :9000)

Flujo de identificación:
  1. El backend envía una imagen via POST /identify (base64 o multipart)
  2. MilkDetector.detect_milk_carton() procesa el frame con OpenCV
  3. Se extraen contornos, formas rectangulares y texto (OCR básico)
  4. Se cruza con la base de datos de empaques conocidos (templates)
  5. Si confianza ≥ 85% → respuesta automática
  6. Si confianza < 85% → se solicita confirmación manual al usuario

Algoritmos implementados:
  - Template Matching (cv2.matchTemplate) para empaques conocidos
  - Detección de contornos rectangulares (típico de cajas de leche)
  - Extracción de texto de fechas de vencimiento (Tesseract OCR)
"""

import cv2
import numpy as np
import os
from datetime import datetime, date
from typing import Optional
from dataclasses import dataclass, field


# ─────────────────────────────────────────────────────────────────────────────
# DATA CLASSES DE RESULTADO
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class DetectionResult:
    """Resultado estructurado de la detección de un producto lácteo."""

    detected: bool
    confidence: float                      # 0.0 a 1.0 (umbral negocio: ≥ 0.85)
    product_name: Optional[str] = None     # Ej: "Leche Entera Soprole 1L"
    sku_guess: Optional[str] = None        # SKU estimado si se reconoce el empaque
    expiry_date: Optional[date] = None     # Fecha extraída por OCR del empaque
    lot_number: Optional[str] = None       # Número de lote si es legible
    bounding_box: Optional[dict] = None   # {"x": 0, "y": 0, "w": 100, "h": 200}
    requires_human_review: bool = False    # True si confianza < 0.85
    error_message: Optional[str] = None   # Mensaje si detection=False


@dataclass
class ProductInfo:
    """Metadata del producto extraída de la imagen."""

    sku: Optional[str] = None
    name: Optional[str] = None
    brand: Optional[str] = None
    format: Optional[str] = None          # Ej: "1L", "500mL", "946mL"
    category: str = "LACTEOS"
    barcode: Optional[str] = None
    expiry_date: Optional[date] = None
    lot_number: Optional[str] = None
    raw_ocr_text: str = ""                # Texto completo extraído por OCR (debug)


# ─────────────────────────────────────────────────────────────────────────────
# CLASE PRINCIPAL: MilkDetector
# ─────────────────────────────────────────────────────────────────────────────
class MilkDetector:
    """
    Motor de Visión Artificial especializado en detección de productos lácteos.

    Uso como servicio:
        detector = MilkDetector()
        result = detector.detect_milk_carton(image_bytes)
        if result.detected and result.confidence >= 0.85:
            info = detector.extract_product_info(image_bytes)

    Uso como singleton en FastAPI:
        from core_cv.detector import milk_detector  # instancia global
    """

    # Umbral de confianza mínima para automatización sin revisión humana
    CONFIDENCE_THRESHOLD: float = 0.85

    # Directorio de templates (imágenes de referencia de empaques conocidos)
    TEMPLATES_DIR: str = os.path.join(os.path.dirname(__file__), "models", "templates")

    def __init__(self):
        """
        Inicializa el detector:
        - Carga los templates de empaques conocidos desde disco
        - Configura el detector de contornos de OpenCV
        - Inicializa el detector de texto (preparado para Tesseract)
        """
        self._templates: dict[str, np.ndarray] = {}
        self._orb = cv2.ORB_create(nfeatures=500)         # Feature detector para matching
        self._bf_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        self._is_ready = False

        self._load_templates()

    # ─────────────────────────────────────────────────────────────────────────
    # MÉTODO PÚBLICO 1: detect_milk_carton
    # ─────────────────────────────────────────────────────────────────────────
    def detect_milk_carton(self, image_bytes: bytes) -> DetectionResult:
        """
        Detecta si la imagen contiene un empaque de leche/lácteo.

        Args:
            image_bytes: Imagen en bytes (JPEG, PNG, WebP).

        Returns:
            DetectionResult con confianza y metadatos básicos.

        Algoritmo:
            1. Decodificar imagen con OpenCV
            2. Pre-procesar: escala de grises, blur gaussiano, umbralización
            3. Detectar contornos rectangulares (forma típica de caja de leche)
            4. Template matching contra empaques conocidos
            5. Calcular score de confianza combinado
        """
        try:
            # 1. Decodificar imagen
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                return DetectionResult(
                    detected=False,
                    confidence=0.0,
                    error_message="No se pudo decodificar la imagen. Formato inválido.",
                )

            # 2. Pre-procesamiento
            gray = self._preprocess_image(img)

            # 3. Detectar contornos rectangulares (forma de caja/tetrapack)
            rectangular_score = self._detect_rectangular_contours(gray)

            # 4. Template matching si hay templates cargados
            template_score, matched_sku = self._template_matching(gray)

            # 5. Score combinado (ponderado)
            confidence = (rectangular_score * 0.4) + (template_score * 0.6)
            confidence = float(np.clip(confidence, 0.0, 1.0))

            detected = confidence > 0.50   # Mínimo 50% para considerar detección

            return DetectionResult(
                detected=detected,
                confidence=confidence,
                sku_guess=matched_sku if template_score > 0.7 else None,
                requires_human_review=confidence < self.CONFIDENCE_THRESHOLD,
                bounding_box=self._get_main_bounding_box(gray) if detected else None,
            )

        except Exception as e:
            return DetectionResult(
                detected=False,
                confidence=0.0,
                error_message=f"Error en detección: {str(e)}",
            )

    # ─────────────────────────────────────────────────────────────────────────
    # MÉTODO PÚBLICO 2: extract_product_info
    # ─────────────────────────────────────────────────────────────────────────
    def extract_product_info(self, image_bytes: bytes) -> ProductInfo:
        """
        Extrae metadatos del producto de la imagen: nombre, marca, fecha, lote.

        Args:
            image_bytes: Imagen en bytes del empaque.

        Returns:
            ProductInfo con todos los campos extraídos (None si no se pudo extraer).

        Nota: Este método asume que detect_milk_carton() ya confirmó la detección.
        El OCR de fechas busca patrones: DD/MM/YYYY, MM/YYYY, YYYY-MM-DD.
        """
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                return ProductInfo(raw_ocr_text="ERROR: imagen inválida")

            # Extraer texto del empaque (OCR)
            raw_text = self._extract_text_ocr(img)

            # Parsear fecha de vencimiento del texto extraído
            expiry_date = self._parse_expiry_date(raw_text)

            # Parsear número de lote
            lot_number = self._parse_lot_number(raw_text)

            # Intentar reconocer la marca por template
            _, matched_sku = self._template_matching(self._preprocess_image(img))
            brand = self._sku_to_brand(matched_sku) if matched_sku else None

            return ProductInfo(
                sku=matched_sku,
                brand=brand,
                category="LACTEOS",
                expiry_date=expiry_date,
                lot_number=lot_number,
                raw_ocr_text=raw_text,
            )

        except Exception as e:
            return ProductInfo(raw_ocr_text=f"ERROR: {str(e)}")

    # ─────────────────────────────────────────────────────────────────────────
    # MÉTODOS PRIVADOS: Procesamiento interno
    # ─────────────────────────────────────────────────────────────────────────
    def _preprocess_image(self, img: np.ndarray) -> np.ndarray:
        """Convierte a escala de grises y aplica filtros para mejorar detección."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        return blurred

    def _detect_rectangular_contours(self, gray: np.ndarray) -> float:
        """
        Detecta contornos rectangulares (típico de envases Tetra Pak / cajas de leche).
        Retorna un score entre 0.0 y 1.0 basado en cuántos rectángulos se encuentran.
        """
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        rectangular_count = 0
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 1000:   # Ignorar contornos muy pequeños (ruido)
                continue
            peri = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.04 * peri, True)

            # Los envases de leche tienen forma de rectángulo (4 vértices)
            if len(approx) == 4:
                x, y, w, h = cv2.boundingRect(approx)
                aspect_ratio = w / float(h)
                # Proporción típica de Tetra Pak: aprox 0.4–0.8 (más alto que ancho)
                if 0.3 <= aspect_ratio <= 0.9:
                    rectangular_count += 1

        # Normalizar: 1 rectángulo adecuado → score alto
        return min(1.0, rectangular_count * 0.35)

    def _template_matching(self, gray: np.ndarray) -> tuple[float, Optional[str]]:
        """
        Compara la imagen con templates de empaques conocidos usando ORB features.
        Retorna (score: float, sku_matched: Optional[str]).
        """
        if not self._templates:
            return 0.0, None

        best_score = 0.0
        best_sku = None

        kp_query, des_query = self._orb.detectAndCompute(gray, None)
        if des_query is None:
            return 0.0, None

        for sku, template_img in self._templates.items():
            kp_tmpl, des_tmpl = self._orb.detectAndCompute(template_img, None)
            if des_tmpl is None:
                continue

            matches = self._bf_matcher.match(des_query, des_tmpl)
            matches = sorted(matches, key=lambda x: x.distance)

            # Score: proporción de buenos matches (distancia < 50)
            good_matches = [m for m in matches if m.distance < 50]
            score = len(good_matches) / max(len(matches), 1)

            if score > best_score:
                best_score = score
                best_sku = sku

        return float(np.clip(best_score, 0.0, 1.0)), best_sku

    def _get_main_bounding_box(self, gray: np.ndarray) -> dict:
        """Retorna el bounding box del contorno principal (producto detectado)."""
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return {"x": 0, "y": 0, "w": 0, "h": 0}

        largest = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest)
        return {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}

    def _extract_text_ocr(self, img: np.ndarray) -> str:
        """
        Extrae texto del empaque.
        En producción: integrar pytesseract.image_to_string(img, lang='spa')
        En esta carcasa: retorna placeholder para pruebas.
        """
        # TODO: Integrar pytesseract en producción
        # import pytesseract
        # gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # return pytesseract.image_to_string(gray, lang='spa', config='--psm 6')
        return "LECHE ENTERA UHT 1L VENCE 15/08/2025 LOTE: L2024-118"

    def _parse_expiry_date(self, text: str) -> Optional[date]:
        """
        Busca patrones de fecha de vencimiento en el texto OCR.
        Formatos soportados: DD/MM/YYYY, MM/YYYY, YYYY-MM-DD.
        """
        import re
        patterns = [
            r"(\d{2}/\d{2}/\d{4})",    # DD/MM/YYYY
            r"(\d{2}-\d{2}-\d{4})",    # DD-MM-YYYY
            r"(\d{4}-\d{2}-\d{2})",    # YYYY-MM-DD (ISO)
            r"VENCE[:\s]+(\d{2}/\d{2}/\d{4})",   # "VENCE: DD/MM/YYYY"
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                try:
                    if "/" in date_str:
                        parts = date_str.split("/")
                        if len(parts[2]) == 4:  # DD/MM/YYYY
                            return date(int(parts[2]), int(parts[1]), int(parts[0]))
                    elif "-" in date_str and len(date_str) == 10:
                        return date.fromisoformat(date_str)  # ISO format
                except (ValueError, IndexError):
                    continue
        return None

    def _parse_lot_number(self, text: str) -> Optional[str]:
        """Busca el número de lote en el texto OCR."""
        import re
        match = re.search(r"LOTE[:\s]+([A-Z0-9\-]+)", text, re.IGNORECASE)
        return match.group(1) if match else None

    def _sku_to_brand(self, sku: Optional[str]) -> Optional[str]:
        """Mapea un SKU reconocido a la marca del producto."""
        brand_map = {
            "LAC-SOP-001": "Soprole",
            "LAC-COL-001": "Colun",
            "LAC-LAL-001": "Lala",
            "LAC-NUT-001": "Nutrileche",
        }
        return brand_map.get(sku) if sku else None

    def _load_templates(self) -> None:
        """
        Carga los templates de empaques conocidos desde el directorio /models/templates/.
        Formato esperado: {SKU}.jpg o {SKU}.png
        """
        if not os.path.exists(self.TEMPLATES_DIR):
            print(f"⚠️  [MilkDetector] Directorio de templates no encontrado: {self.TEMPLATES_DIR}")
            self._is_ready = False
            return

        loaded = 0
        for filename in os.listdir(self.TEMPLATES_DIR):
            if filename.endswith((".jpg", ".png", ".jpeg")):
                sku = os.path.splitext(filename)[0]
                filepath = os.path.join(self.TEMPLATES_DIR, filename)
                img = cv2.imread(filepath, cv2.IMREAD_GRAYSCALE)
                if img is not None:
                    self._templates[sku] = img
                    loaded += 1

        self._is_ready = loaded > 0
        print(f"✅ [MilkDetector] {loaded} template(s) de empaques cargados.")

    @property
    def is_ready(self) -> bool:
        """Indica si el detector está listo para procesar imágenes."""
        return self._is_ready


# ─────────────────────────────────────────────────────────────────────────────
# INSTANCIA SINGLETON — importar en el backend como:
#   from core_cv.detector import milk_detector
# ─────────────────────────────────────────────────────────────────────────────
milk_detector = MilkDetector()
