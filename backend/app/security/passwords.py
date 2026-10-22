"""密码哈希：bcrypt（自带盐）。兼容旧明文，校验成功后可升级。"""
from __future__ import annotations

import hashlib

import bcrypt

# bcrypt 上限 72 字节；超长截断前先编码
_BCRYPT_PREFIXES = (b"$2a$", b"$2b$", b"$2y$")

_MIN_LEN = 8
# 常见弱口令明文黑名单（不含历史默认口令原文，见 _WEAK_SHA256）
_WEAK_PLAIN = {
    "12345678",
    "password",
    "bifang",
    "ant.design",
    "admin123",
    "qwerty123",
}
# 历史默认口令的 sha256（源码不落明文）
_WEAK_SHA256 = {
    "dc455c7f96748d9656c54f967a11a25fa7168015b8f7551c0b235b3cdb8d66b8",
}
# 同摘要：登录成功时标记 must_change_password
LEGACY_DEFAULT_SHA256 = _WEAK_SHA256


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


def validate_password_strength(pwd: str, username: str = "") -> str | None:
    """弱口令校验；命中返回错误文案，通过返回 None。"""
    if len(pwd or "") < _MIN_LEN:
        return f"密码至少 {_MIN_LEN} 位"
    if pwd.lower() == (username or "").lower():
        return "密码不能与用户名相同"
    lowered = (pwd or "").strip().lower()
    if lowered in _WEAK_PLAIN:
        return "密码过于常见，请更换"
    digest = hashlib.sha256((pwd or "").encode("utf-8")).hexdigest()
    if digest in _WEAK_SHA256:
        return "密码过于常见，请更换"
    return None


def is_legacy_default_password(plain: str) -> bool:
    digest = hashlib.sha256((plain or "").encode("utf-8")).hexdigest()
    return digest in LEGACY_DEFAULT_SHA256
