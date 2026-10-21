"""密码哈希：bcrypt（自带盐）。兼容旧明文，校验成功后可升级。"""
from __future__ import annotations

import bcrypt

# bcrypt 上限 72 字节；超长截断前先编码
_BCRYPT_PREFIXES = (b"$2a$", b"$2b$", b"$2y$")


def hash_password(plain: str) -> str:
    raw = (plain or "").encode("utf-8")
    if len(raw) > 72:
        raw = raw[:72]
    hashed = bcrypt.hashpw(raw, bcrypt.gensalt(rounds=12))
    return hashed.decode("ascii")


def is_hashed(stored: str | None) -> bool:
    if not stored:
        return False
    b = stored.encode("ascii", errors="ignore")
    return any(b.startswith(p) for p in _BCRYPT_PREFIXES)


def verify_password(plain: str, stored: str | None) -> bool:
    if stored is None:
        return False
    if is_hashed(stored):
        try:
            raw = (plain or "").encode("utf-8")
            if len(raw) > 72:
                raw = raw[:72]
            return bcrypt.checkpw(raw, stored.encode("ascii"))
        except (ValueError, TypeError):
            return False
    # 历史明文
    return (plain or "") == stored


def needs_rehash(stored: str | None) -> bool:
    """明文或将来算法升级时返回 True。"""
    return not is_hashed(stored)
