"""
StockAI — Motor de Visión Artificial
FastAPI + OpenCV · Puerto 9000

Endpoints:
  POST /identify   — Identificar producto por imagen
  GET  /health     — Health check para Docker
"""
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn, os, logging

from src.schemas     import IdentifyResponse
from src.identifier  import ProductIdentifier
import src.ocr_pipeline as _ocr

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stockai-ai")

app = FastAPI(title="StockAI Vision API", version="1.0.0")


@app.on_event("startup")
async def _startup():
    """Pre-carga EasyOCR y CLIP en background para no bloquear el servidor."""
    import threading
    threading.Thread(target=_ocr.preload_models, daemon=True, name="model-preloader").start()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

identifier = ProductIdentifier()

@app.get("/health")
def health():
    return {"status": "ok", "service": "stockai-ai", "version": "1.0.0"}


@app.post("/identify", response_model=IdentifyResponse)
async def identify(image: UploadFile = File(...)):
    """
    Recibe una imagen multipart/form-data y retorna:
      - detected       : bool
      - confidence     : float (0.0 – 1.0)
      - product_name   : str | None
      - sku_guess      : str | None
      - barcode        : str | None
      - expiry_date    : str | None  (YYYY-MM-DD)
      - lot_number     : str | None
      - bounding_box   : dict | None
    """
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos de imagen.")

    data = await image.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagen supera 10 MB.")

    try:
        result = identifier.identify(data, image.content_type)
        logger.info("[IDENTIFY] detected=%s confidence=%.2f ocr=%.2f",
                    result.get("detected"), result.get("confidence", 0),
                    result.get("ocr_confidence", 0))
        return result
    except Exception as e:
        logger.error(f"[IDENTIFY] Error: {e}")
        raise HTTPException(status_code=500, detail="Error interno del motor de visión.")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 9000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=os.getenv("ENV") == "development")
