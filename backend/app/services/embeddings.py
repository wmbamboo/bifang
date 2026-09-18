from __future__ import annotations

import threading
from typing import Optional

import numpy as np

from app.config import get_settings

_lock = threading.Lock()
_model = None


def _resolve_device() -> str:
    settings = get_settings()
    device = (settings.embedding_device or "cuda").strip().lower()
    if device in {"cuda", "gpu"}:
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        return "cpu"
    return device or "cpu"


def get_embedding_model():
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        settings = get_settings()
        from sentence_transformers import SentenceTransformer

        device = _resolve_device()
        print(f"[embedding] loading {settings.embedding_model} on {device}")
        _model = SentenceTransformer(settings.embedding_model, device=device)
        return _model


def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    if not texts:
        return []
    model = get_embedding_model()
    vectors = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return [v.tolist() for v in np.asarray(vectors)]


def embed_query(text: str) -> list[float]:
    vecs = embed_texts([text])
    return vecs[0] if vecs else []


def embedding_dim() -> Optional[int]:
    model = get_embedding_model()
    try:
        return int(model.get_sentence_embedding_dimension())
    except Exception:
        sample = embed_texts(["dim"])
        return len(sample[0]) if sample else None
