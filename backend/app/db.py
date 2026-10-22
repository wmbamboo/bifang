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

            CREATE TABLE IF NOT EXISTS user_roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                role_code TEXT NOT NULL,
                UNIQUE(username, role_code)
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
                record_time TEXT,
                event TEXT DEFAULT '',
                action TEXT DEFAULT '',
                target TEXT DEFAULT '',
                result TEXT DEFAULT 'ok',
                detail TEXT DEFAULT '',
                session_id TEXT DEFAULT '',
                duration_ms INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS login_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL DEFAULT '',
                name TEXT DEFAULT '',
                client_ip TEXT DEFAULT '',
                user_agent TEXT DEFAULT '',
                event TEXT NOT NULL,
                reason TEXT DEFAULT '',
                session_id TEXT DEFAULT '',
                login_at TEXT,
                logout_at TEXT,
                duration_s INTEGER DEFAULT 0,
                record_time TEXT
            );

            CREATE TABLE IF NOT EXISTS feedbacks (
                id TEXT PRIMARY KEY,
                feedback_type TEXT NOT NULL,
                content TEXT NOT NULL,
                page TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                assignee TEXT DEFAULT '',
                assignee_name TEXT DEFAULT '',
                resolved_by TEXT DEFAULT '',
                resolved_at TEXT DEFAULT '',
                visibility TEXT DEFAULT 'internal',
                env TEXT DEFAULT '',
                notify_status TEXT DEFAULT '',
                notify_at TEXT DEFAULT '',
                gen_id TEXT DEFAULT '',
                gen_type TEXT DEFAULT '',
                outline_id TEXT DEFAULT '',
                target_key TEXT DEFAULT '',
                context_json TEXT DEFAULT '',
                images TEXT DEFAULT '',
                contact TEXT DEFAULT '',
                user TEXT DEFAULT '',
                user_name TEXT DEFAULT '',
                reply TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_fb_status ON feedbacks(status);
            CREATE INDEX IF NOT EXISTS idx_fb_gen ON feedbacks(gen_id);
            CREATE INDEX IF NOT EXISTS idx_fb_created ON feedbacks(created_at);
            CREATE INDEX IF NOT EXISTS idx_fb_assignee ON feedbacks(assignee);

            CREATE TABLE IF NOT EXISTS feedback_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feedback_id TEXT NOT NULL,
                user TEXT DEFAULT '',
                user_name TEXT DEFAULT '',
                content TEXT NOT NULL,
                created_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_fbc_fb ON feedback_comments(feedback_id);

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
        _migrate_user_logs_columns(conn)
        _migrate_users_password_flags(conn)
        _seed_defaults(conn)
        _seed_rbac_and_samples(conn)
        _migrate_plaintext_passwords(conn)
        _maybe_reset_admin_password(conn)
        _ensure_login_logs(conn)
        _patch_audit_menu_and_kb_user(conn)
        _patch_user_emails_and_lizy(conn)
        _patch_rbac_scheme_c(conn)

    # 启动清理旧日志（短事务）
    try:
        from app.services.audit import purge_old_logs

        purge_old_logs()
    except Exception:
        pass


def _migrate_user_logs_columns(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_logs)").fetchall()}
    alters = [
        ("event", "TEXT DEFAULT ''"),
        ("action", "TEXT DEFAULT ''"),
        ("target", "TEXT DEFAULT ''"),
        ("result", "TEXT DEFAULT 'ok'"),
        ("detail", "TEXT DEFAULT ''"),
        ("session_id", "TEXT DEFAULT ''"),
        ("duration_ms", "INTEGER DEFAULT 0"),
    ]
    for name, typ in alters:
        if name in cols:
            continue
        try:
            conn.execute(f"ALTER TABLE user_logs ADD COLUMN {name} {typ}")
        except sqlite3.OperationalError:
            pass


def _ensure_login_logs(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS login_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL DEFAULT '',
            name TEXT DEFAULT '',
            client_ip TEXT DEFAULT '',
            user_agent TEXT DEFAULT '',
            event TEXT NOT NULL,
            reason TEXT DEFAULT '',
            session_id TEXT DEFAULT '',
            login_at TEXT,
            logout_at TEXT,
            duration_s INTEGER DEFAULT 0,
            record_time TEXT
        )
        """
    )
    cols = {r[1] for r in conn.execute("PRAGMA table_info(login_logs)").fetchall()}
    if "record_time" not in cols:
        try:
            conn.execute("ALTER TABLE login_logs ADD COLUMN record_time TEXT")
        except sqlite3.OperationalError:
            pass


def _patch_audit_menu_and_kb_user(conn: sqlite3.Connection) -> None:
    """审计菜单授权给 admin（43.5）。知识库授 user 已由方案 C 回滚，见 _patch_rbac_scheme_c。"""
    conn.execute(
        """
        INSERT OR IGNORE INTO menus
        (id, zh_name, name, access, icon, path, "order", p_id, module_menu_flag)
        VALUES (22, '日志审计', 'auditLogs', 'auditLogs', 'ProfileOutlined', '/admin/audit', 10, 12, '0')
        """
    )
    conn.execute(
        """
        INSERT INTO role_res (auth_res, res_type, res_status, role_code)
        SELECT 'auditLogs', 'menu', '1', 'admin'
        WHERE NOT EXISTS (
            SELECT 1 FROM role_res
            WHERE auth_res='auditLogs' AND res_type='menu' AND role_code='admin'
        )
        """
    )


def _patch_rbac_scheme_c(conn: sqlite3.Connection) -> None:
    """
    RBAC 方案 C：user_roles 多角色；回滚 43.10A（user 全员知识库）；
    新建 kb_manager 并改授知识库菜单；回填既有用户角色。
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            role_code TEXT NOT NULL,
            UNIQUE(username, role_code)
        )
        """
    )
    # 回滚 A：删掉授给 user 的知识库菜单
    conn.execute(
        """
        DELETE FROM role_res
        WHERE role_code='user' AND res_type='menu'
          AND auth_res IN ('kbMgt', 'kbFileMgt')
        """
    )
    # kb_manager 角色
    conn.execute(
        """
        INSERT INTO roles (role_code, role_name, role_desc, sys_role_flag, role_status, update_time)
        SELECT 'kb_manager', '知识库管理员', '可管理知识库与文件，无系统管理权', 0, 1, ?
        WHERE NOT EXISTS (SELECT 1 FROM roles WHERE role_code='kb_manager')
        """,
        (_now(),),
    )
    for access in ("kbMgt", "kbFileMgt"):
        conn.execute(
            """
            INSERT INTO role_res (auth_res, res_type, res_status, role_code)
            SELECT ?, 'menu', '1', 'kb_manager'
            WHERE NOT EXISTS (
                SELECT 1 FROM role_res
                WHERE auth_res=? AND res_type='menu' AND role_code='kb_manager'
            )
            """,
            (access, access),
        )
    # 回填：每个用户至少有一条 user_roles（来自 users.access）
    users = conn.execute("SELECT username, access FROM users").fetchall()
    for u in users:
        username = u["username"]
        access = (u["access"] or "user").strip() or "user"
        exists = conn.execute(
            "SELECT 1 FROM user_roles WHERE username=? LIMIT 1", (username,)
        ).fetchone()
        if not exists:
            conn.execute(
                "INSERT INTO user_roles (username, role_code) VALUES (?, ?)",
                (username, access if access in ("admin", "user", "kb_manager") else "user"),
            )
    # lizy：user + kb_manager（保住知识库能力，且不污染全体 user）
    lizy = conn.execute(
        "SELECT username FROM users WHERE username='lizy'"
    ).fetchone()
    if lizy:
        for code in ("user", "kb_manager"):
            conn.execute(
                """
                INSERT INTO user_roles (username, role_code)
                SELECT 'lizy', ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM user_roles WHERE username='lizy' AND role_code=?
                )
                """,
                (code, code),
            )


def _patch_user_emails_and_lizy(conn: sqlite3.Connection) -> None:
    """hezl 补邮箱；lizy 降为 user（43.1 / 43.10A）。"""
    conn.execute(
        "UPDATE users SET email=? WHERE username=? AND (email IS NULL OR email='')",
        ("hezeling@zptxtech.cn", "hezl"),
    )
    conn.execute(
        "UPDATE users SET access='user' WHERE username='lizy' AND access!='user'",
    )


def _seed_admin_password() -> tuple[str, bool]:
    """返回 (密码, 是否自动生成)。环境变量优先；缺省随机。"""
    import os
    import secrets

    env = (os.getenv("BIFANG_SEED_ADMIN_PASSWORD") or "").strip()
    if env:
        return env, False
    return secrets.token_urlsafe(12), True


def _migrate_users_password_flags(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    for name, typ in (
        ("must_change_password", "INTEGER DEFAULT 0"),
        ("pwd_changed_at", "TEXT DEFAULT ''"),
    ):
        if name in cols:
            continue
        try:
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {typ}")
        except sqlite3.OperationalError:
            pass


def _maybe_reset_admin_password(conn: sqlite3.Connection) -> None:
    """BIFANG_RESET_ADMIN_PASSWORD 存在则重置 admin 并标记强改（用完请删 env）。"""
    import logging
    import os

    from app.security.passwords import hash_password

    plain = (os.getenv("BIFANG_RESET_ADMIN_PASSWORD") or "").strip()
    if not plain:
        return
    row = conn.execute("SELECT userid FROM users WHERE username='admin'").fetchone()
    if not row:
        return
    conn.execute(
        """
        UPDATE users SET password=?, must_change_password=1, pwd_changed_at=''
        WHERE username='admin'
        """,
        (hash_password(plain),),
    )
    logging.getLogger("bifang").warning(
        "已按环境变量 BIFANG_RESET_ADMIN_PASSWORD 重置 admin 密码，请从部署环境删除该变量"
    )


def _seed_defaults(conn: sqlite3.Connection) -> None:
    import logging
    import os
    from pathlib import Path

    from app.security.passwords import hash_password

    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if user_count != 0:
        return

    plain, auto = _seed_admin_password()
    avatar = "https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png"
    conn.execute(
        """
        INSERT INTO users (
            userid, username, password, name, access, unit, dept, email, phone,
            address, signature, avatar, must_change_password
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """,
        (
            "00000001",
            "admin",
            hash_password(plain),
            "毕方",
            "admin",
            "英创互联",
            "AI技术部",
            "",
            "",
            "",
            "毕生所学，方为一用",
            avatar,
        ),
    )
    if auto:
        settings = get_settings()
        out = Path(settings.data_dir) / "initial_admin.txt"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            f"username=admin\npassword={plain}\ngenerated_at={_now()}\n",
            encoding="utf-8",
        )
        try:
            os.chmod(out, 0o600)
        except OSError:
            pass
        logging.getLogger("bifang").warning(
            "首次管理员密码已生成，见 %s，请登录后立即修改", out
        )


def _migrate_plaintext_passwords(conn: sqlite3.Connection) -> None:
    """把仍是明文的 password 升级为 bcrypt（启动时幂等）。"""
    from app.security.passwords import hash_password, is_hashed

    rows = conn.execute("SELECT userid, password FROM users").fetchall()
    for row in rows:
        pwd = row["password"] or ""
        if is_hashed(pwd):
            continue
        if not pwd:
            continue
        conn.execute(
            "UPDATE users SET password=? WHERE userid=?",
            (hash_password(pwd), row["userid"]),
        )


def _seed_rbac_and_samples(conn: sqlite3.Connection) -> None:
    """原 _seed_defaults 后半：角色/菜单/机构/示例库（保持幂等）。"""
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
            (21, "反馈管理", "feedbackMgt", "feedbackMgt", "MessageOutlined", "/admin/feedback", 9, 12),
        ]
        for mid, zh, name, access, icon, path, order, pid in menus:
            conn.execute(
                """
                INSERT INTO menus (id, zh_name, name, access, icon, path, "order", p_id, module_menu_flag)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (mid, zh, name, access, icon, path, order, pid, "1" if pid == 0 else "0"),
            )

    # 幂等补丁：已有库不会走 menu_count==0 分支，须补反馈管理菜单与 admin 授权
    conn.execute(
        """
        INSERT OR IGNORE INTO menus
        (id, zh_name, name, access, icon, path, "order", p_id, module_menu_flag)
        VALUES (21, '反馈管理', 'feedbackMgt', 'feedbackMgt', 'MessageOutlined', '/admin/feedback', 9, 12, '0')
        """
    )
    conn.execute(
        """
        INSERT INTO role_res (auth_res, res_type, res_status, role_code)
        SELECT 'feedbackMgt', 'menu', '1', 'admin'
        WHERE NOT EXISTS (
            SELECT 1 FROM role_res
            WHERE auth_res='feedbackMgt' AND res_type='menu' AND role_code='admin'
        )
        """
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
    return {"code": code, "msg": msg, "errorMessage": msg, "data": data, "success": False}


def new_id() -> str:
    return uuid.uuid4().hex


def ms_now() -> int:
    return int(time.time() * 1000)
