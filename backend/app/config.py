from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    deepseek_api_key: str = ""
    deepseek_api_base: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    embedding_model: str = "BAAI/bge-large-zh-v1.5"
    embedding_device: str = "cuda"
    # hybrid | vector | bm25
    retrieval_mode: str = "hybrid"

    host: str = "0.0.0.0"
    port: int = 7861
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000"

    data_dir: str = str(BASE_DIR / "data")

    chunk_size: int = 500
    chunk_overlap: int = 80
    default_top_k: int = 5
    # 向量余弦门槛（已归一化），不是混合分。bge 无关文本多在 0.45 以下，相关多在 0.6 以上。
    # 问答、智能检索，以及大纲/正文的第一跳都用它。
    default_score_threshold: float = 0.5

    # 大纲与正文：按向量取前 N 条。混合排序容易把封面、爆款标题页顶上来。
    writing_vector_top_k: int = 12
    # 每个片段最多取几个引号专名
    writing_quote_per_chunk: int = 3
    # 第二跳专名个数上限
    writing_name_limit: int = 8
    # 每个专名的向量候选条数
    writing_name_top_k: int = 3
    # 专名第二跳的余弦门槛。短专名对长片段常只有 0.3～0.45，0 表示不按分数过滤，原文包含该专名才保留。
    writing_name_score_threshold: float = 0.0
    # 最终送进模型的片段上限
    writing_context_limit: int = 14

    # OCR：扫描件 / 图表文字混排 PDF
    ocr_enabled: bool = True
    # paddleocr_vl（PaddleOCR-VL，版面/表格更强）| rapidocr（轻量回退）
    ocr_engine: str = "paddleocr_vl"
    # PaddleOCR-VL 管线版本：v1 | v1.5 | v1.6
    ocr_vl_pipeline_version: str = "v1.5"
    # 推理后端：transformers（与 torch 共存，推荐）| paddle（需 paddlepaddle-gpu，易与 torch CUDA 冲突）
    ocr_vl_engine: str = "transformers"
    # 单页原生文字少于此字数则触发 OCR
    ocr_min_chars_per_page: int = 40
    # 渲染倍率（约等于 dpi/72）；2.0 ≈ 144dpi，兼顾速度与识别率
    ocr_dpi_scale: float = 2.0
    # True=每页都 OCR（更慢，适合整本扫描）
    ocr_force_all_pages: bool = False

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).resolve()

    @property
    def kb_root(self) -> Path:
        return self.data_path / "knowledge_base"

    @property
    def chroma_dir(self) -> Path:
        return self.data_path / "chroma"

    @property
    def db_path(self) -> Path:
        return self.data_path / "bifang.db"

    @property
    def origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
