import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from app.config import get_settings


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def init_db() -> None:
    settings = get_settings()
    settings.data_path.mkdir(parents=True, exist_ok=True)
    settings.kb_root.mkdir(parents=True, exist_ok=True)
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)

    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS knowledge_bases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kb_name TEXT UNIQUE NOT NULL,
                kb_info TEXT DEFAULT '',
                vs_type TEXT DEFAULT 'chroma',
                embed_model TEXT DEFAULT '',
                create_time TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS kb_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kb_name TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_ext TEXT DEFAULT '',
                file_size INTEGER DEFAULT 0,
                file_mtime REAL DEFAULT 0,
                docs_count INTEGER DEFAULT 0,
                in_folder INTEGER DEFAULT 1,
                in_db INTEGER DEFAULT 0,
                create_time TEXT NOT NULL,
                UNIQUE(kb_name, file_name)
            );

            CREATE TABLE IF NOT EXISTS users (
                userid TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT DEFAULT '',
                access TEXT DEFAULT 'user',
                email TEXT DEFAULT '',
                phone TEXT DEFAULT '',
                gender TEXT DEFAULT '',
                org_code TEXT DEFAULT '',
                org_name TEXT DEFAULT '',
                unit TEXT DEFAULT '',
                dept TEXT DEFAULT '',
                address TEXT DEFAULT '',
                signature TEXT DEFAULT '',
                avatar TEXT DEFAULT '',
                user_status INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS menus (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                zh_name TEXT,
                name TEXT,
                access TEXT,
                icon TEXT DEFAULT '',
                path TEXT DEFAULT '',
                cmct TEXT DEFAULT '',
                "order" INTEGER DEFAULT 0,
                p_id INTEGER DEFAULT 0,
                remark TEXT DEFAULT '',
                hide_menu_flag INTEGER DEFAULT 0,
                sys_menu_flag INTEGER DEFAULT 0,
                module_menu_flag TEXT DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role_code TEXT UNIQUE NOT NULL,
                role_name TEXT NOT NULL,
                role_desc TEXT DEFAULT '',
                sys_role_flag INTEGER DEFAULT 0,
                role_status INTEGER DEFAULT 1,
                update_time TEXT
            );

            CREATE TABLE IF NOT EXISTS role_res (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                auth_res TEXT NOT NULL,
                res_type TEXT NOT NULL,
                res_status TEXT DEFAULT '1',
                role_code TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orgs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                org_code TEXT UNIQUE NOT NULL,
                org_name TEXT NOT NULL,
                org_fn TEXT DEFAULT '',
                org_desc TEXT DEFAULT '',
                pid INTEGER DEFAULT 0,
                update_time TEXT
            );

            CREATE TABLE IF NOT EXISTS user_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user TEXT,
                name TEXT,
                org_code TEXT DEFAULT '',
                org_name TEXT DEFAULT '',
                source TEXT DEFAULT '',
                url TEXT DEFAULT '',
                module TEXT DEFAULT '',
                menu TEXT DEFAULT '',
                fcn TEXT DEFAULT '',
                client_ip TEXT DEFAULT '',
                request_id TEXT DEFAULT '',
                record_time TEXT
            );

            CREATE TABLE IF NOT EXISTS chat_convs (
                id TEXT PRIMARY KEY,
                user TEXT,
                chat_type TEXT DEFAULT 'llm',
                kb_name TEXT DEFAULT '',
                name TEXT DEFAULT '新会话',
                mod_fcn TEXT DEFAULT '',
                create_time TEXT
            );

            CREATE TABLE IF NOT EXISTS chat_msgs (
                uid TEXT PRIMARY KEY,
                id TEXT NOT NULL,
                conv_id TEXT NOT NULL,
                role TEXT NOT NULL,
                message TEXT DEFAULT '',
                content TEXT DEFAULT '',
                parentId TEXT DEFAULT '',
                extra TEXT DEFAULT '{}',
                createAt INTEGER,
                updateAt INTEGER,
                create_time TEXT
            );

            CREATE TABLE IF NOT EXISTS upload_tasks (
                id TEXT PRIMARY KEY,
                kb_name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                total INTEGER DEFAULT 0,
                done INTEGER DEFAULT 0,
                failed INTEGER DEFAULT 0,
                current_file TEXT DEFAULT '',
                message TEXT DEFAULT '',
                create_time TEXT NOT NULL,
                update_time TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS upload_task_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_size INTEGER DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                stage TEXT DEFAULT 'queued',
                progress INTEGER DEFAULT 0,
                docs_count INTEGER DEFAULT 0,
                error TEXT DEFAULT '',
                create_time TEXT NOT NULL,
                update_time TEXT NOT NULL,
                UNIQUE(task_id, file_name)
            );
            """
        )
        _seed_defaults(conn)


def _seed_defaults(conn: sqlite3.Connection) -> None:
    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count == 0:
        default_users = [
            ("00000001", "admin", "bifang.intronlink", "毕方", "admin"),
            ("00000002", "user", "bifang.intronlink", "毕方user", "user"),
            ("00000003", "guest", "bifang.intronlink", "毕方guest", "user"),
        ]
        avatar = "https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png"
        for userid, username, password, name, access in default_users:
            conn.execute(
                """
                INSERT INTO users (userid, username, password, name, access, unit, dept, email, phone, address, signature, avatar)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    userid,
                    username,
                    password,
                    name,
                    access,
                    "英创互联",
                    "英创互联－AI技术部",
                    "antdesign@alipay.com",
                    "010-15021502",
                    "财智大厦A-1502",
                    "毕生所学，方为一用",
                    avatar,
                ),
            )

    role_count = conn.execute("SELECT COUNT(*) FROM roles").fetchone()[0]
    if role_count == 0:
        conn.execute(
            "INSERT INTO roles (role_code, role_name, role_desc, sys_role_flag, role_status, update_time) VALUES (?, ?, ?, 1, 1, ?)",
            ("admin", "管理员", "系统管理员", _now()),
        )
        conn.execute(
            "INSERT INTO roles (role_code, role_name, role_desc, sys_role_flag, role_status, update_time) VALUES (?, ?, ?, 0, 1, ?)",
            ("user", "普通用户", "普通用户", _now()),
        )

    menu_count = conn.execute("SELECT COUNT(*) FROM menus").fetchone()[0]
    if menu_count == 0:
        menus = [
            (1, "知识搜索与问答", "welcome", "welcome", "crown", "/welcome", 1, 0),
            (2, "智能检索", "docSearch", "docSearch", "search", "/welcome/doc-search", 1, 1),
            (3, "智能问答", "aiAnswer", "aiAnswer", "CodeSandboxOutlined", "/welcome/aiAnswer", 2, 1),
            (4, "知识库问答", "kbAnswer", "kbAnswer", "HddOutlined", "/welcome/kbAnswer", 3, 1),
            (5, "基于知识库写作", "kbGen", "kbGen", "crown", "/kbGen", 2, 0),
            (6, "知识库大纲写作", "KbGenOutline", "KbGenOutline", "FileWordOutlined", "/kbGen/KbGenDocOutline", 1, 5),
            (7, "智能校对", "qbjc", "qbjc", "crown", "/qbjc", 3, 0),
            (8, "智能校对写作", "QbjcKbGenOutline", "QbjcKbGenOutline", "FileWordOutlined", "/qbjc/QbjcKbGenDocOutline", 1, 7),
            (9, "智能摘要校对", "qbzb", "qbzb", "crown", "/qbzb", 4, 0),
            (10, "智能摘要", "QbzbKbGenOutline", "QbzbKbGenOutline", "FileWordOutlined", "/qbzb/QbzbKbGenDocOutline", 1, 9),
            (11, "智能校对", "QbzbKbGenOutline1", "QbzbKbGenOutline1", "FileWordOutlined", "/qbzb/QbzbKbGenDocOutline1", 2, 9),
            (12, "系统管理", "admin", "admin", "crown", "/admin", 5, 0),
            (13, "知识库管理", "kbMgt", "kbMgt", "FolderOpenOutlined", "/admin/kb", 1, 12),
            (14, "知识库文件", "kbFileMgt", "kbFileMgt", "FileTextOutlined", "/admin/kbFile", 2, 12),
            (15, "用户管理", "userMgt", "userMgt", "UserOutlined", "/admin/user", 3, 12),
            (16, "用户日志", "userLogs", "userLogs", "UserOutlined", "/admin/userLogs", 4, 12),
            (17, "个人中心", "userProfile", "userProfile", "UserOutlined", "/admin/userProfile", 5, 12),
            (18, "菜单管理", "menu", "menu", "FolderOpenOutlined", "/admin/menu", 6, 12),
            (19, "角色管理", "role", "role", "ProfileOutlined", "/admin/role", 7, 12),
            (20, "机构管理", "org", "org", "ProfileOutlined", "/admin/org", 8, 12),
        ]
        for mid, zh, name, access, icon, path, order, pid in menus:
            conn.execute(
                """
                INSERT INTO menus (id, zh_name, name, access, icon, path, "order", p_id, module_menu_flag)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (mid, zh, name, access, icon, path, order, pid, "1" if pid == 0 else "0"),
            )

    res_count = conn.execute("SELECT COUNT(*) FROM role_res").fetchone()[0]
    if res_count == 0:
        accesses = [r[0] for r in conn.execute("SELECT access FROM menus").fetchall()]
        for access in accesses:
            conn.execute(
                "INSERT INTO role_res (auth_res, res_type, res_status, role_code) VALUES (?, 'menu', '1', 'admin')",
                (access,),
            )
            if access in {"welcome", "docSearch", "aiAnswer", "kbAnswer", "kbGen", "KbGenOutline", "userProfile"}:
                conn.execute(
                    "INSERT INTO role_res (auth_res, res_type, res_status, role_code) VALUES (?, 'menu', '1', 'user')",
                    (access,),
                )

    org_count = conn.execute("SELECT COUNT(*) FROM orgs").fetchone()[0]
    if org_count == 0:
        conn.execute(
            "INSERT INTO orgs (org_code, org_name, org_fn, org_desc, pid, update_time) VALUES (?, ?, ?, ?, 0, ?)",
            ("ROOT", "英创互联", "总部", "默认机构", _now()),
        )

    kb_count = conn.execute("SELECT COUNT(*) FROM knowledge_bases").fetchone()[0]
    if kb_count == 0:
        settings = get_settings()
        conn.execute(
            """
            INSERT INTO knowledge_bases (kb_name, kb_info, vs_type, embed_model, create_time)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("samples", "示例知识库", "faiss", settings.embedding_model, _now()),
        )
        (settings.kb_root / "samples" / "content").mkdir(parents=True, exist_ok=True)
        sample = settings.kb_root / "samples" / "content" / "欢迎使用毕方.txt"
        if not sample.exists():
            sample.write_text(
                "毕方智能知识管理平台欢迎您。\n\n"
                "本平台支持文档上传、智能检索、知识库问答与智能写作。\n"
                "您可以在知识库管理中创建知识库并上传 PDF、Word、PPT、TXT 等文档。\n"
                "上传后进行向量化，即可在智能检索与知识库问答中使用。\n",
                encoding="utf-8",
            )
        conn.execute(
            """
            INSERT OR IGNORE INTO kb_files
            (kb_name, file_name, file_ext, file_size, file_mtime, docs_count, in_folder, in_db, create_time)
            VALUES (?, ?, ?, ?, ?, 0, 1, 0, ?)
            """,
            (
                "samples",
                sample.name,
                ".txt",
                sample.stat().st_size,
                sample.stat().st_mtime,
                _now(),
            ),
        )


@contextmanager
def get_conn():
    settings = get_settings()
    conn = sqlite3.connect(str(settings.db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row: Optional[sqlite3.Row]) -> Optional[dict]:
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows: list[sqlite3.Row]) -> list[dict]:
    return [dict(r) for r in rows]


def ok(data: Any = None, msg: str = "success", code: int = 200) -> dict:
    return {"code": code, "msg": msg, "data": data, "success": True}


def fail(msg: str = "error", code: int = 500, data: Any = None) -> dict:
    return {"code": code, "msg": msg, "data": data, "success": False}


def new_id() -> str:
    return uuid.uuid4().hex


def ms_now() -> int:
    return int(time.time() * 1000)
