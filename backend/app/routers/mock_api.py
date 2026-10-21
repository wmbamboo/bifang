from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Query, Request

from app.db import get_conn, ok, fail, rows_to_list, _now, new_id
from app.security import auth as auth_mod
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.services import audit

router = APIRouter(prefix="/mock_api", tags=["mock_api"])

# 兼容旧引用：指向 auth 模块会话表
_TOKENS = auth_mod._TOKENS


def _user_by_username(username: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    return dict(row) if row else None


def _public_user(u: dict) -> dict:
    data = dict(u)
    data.pop("password", None)
    data.pop("_token", None)
    data.pop("_session_id", None)
    data.pop("_login_at", None)
    data["user_status"] = bool(data.get("user_status", 1))
    return data


@router.post("/login/account")
async def login_account(request: Request):
    body = await request.json()
    username = body.get("username") or ""
    password = body.get("password") or ""
    login_type = body.get("type") or "account"
    ip, ua = auth_mod.client_meta(request)
    user = _user_by_username(username)
    stored = (user or {}).get("password") or ""
    if user and verify_password(password, stored):
        if not int(user.get("user_status") or 0):
            audit.write_login_log(
                username=username,
                name=user.get("name") or "",
                client_ip=ip,
                user_agent=ua,
                event="login_fail",
                reason="账号已停用",
            )
            return ok(
                {
                    "status": "error",
                    "type": login_type,
                    "currentAuthority": "guest",
                    "token": "",
                },
                msg="账号已停用",
                code=200,
            )
        # 明文或旧算法：登录成功后升级为 bcrypt
        if needs_rehash(stored):
            with get_conn() as conn:
                conn.execute(
                    "UPDATE users SET password=? WHERE userid=?",
                    (hash_password(password), user["userid"]),
                )
        token = auth_mod.issue_token(username)
        audit.write_login_log(
            username=username,
            name=user.get("name") or "",
            client_ip=ip,
            user_agent=ua,
            event="login_ok",
            session_id=auth_mod.session_id_of(token),
            login_at=_now(),
        )
        return ok(
            {
                "status": "ok",
                "type": login_type,
                "currentAuthority": user.get("access") or "user",
                "token": token,
            },
            msg="登录成功",
        )
    audit.write_login_log(
        username=username or "",
        name=(user or {}).get("name") or "",
        client_ip=ip,
        user_agent=ua,
        event="login_fail",
        reason="密码错误" if user else "用户不存在",
    )
    return ok(
        {"status": "error", "type": login_type, "currentAuthority": "guest", "token": ""},
        msg="用户名或密码错误",
        code=200,
    )


@router.post("/login/outLogin")
async def out_login(request: Request):
    token = auth_mod.extract_token(request)
    sess = auth_mod.revoke_token(token) if token else None
    if sess:
        login_at = float(sess.get("login_at") or 0)
        now = time.time()
        audit.write_login_log(
            username=str(sess.get("username") or ""),
            event="logout",
            session_id=auth_mod.session_id_of(token),
            login_at=datetime.fromtimestamp(login_at).isoformat(timespec="seconds")
            if login_at
            else None,
            logout_at=_now(),
            duration_s=max(0, int(now - login_at)) if login_at else 0,
            client_ip=auth_mod.client_meta(request)[0],
            user_agent=auth_mod.client_meta(request)[1],
        )
    return ok({}, msg="已退出")


@router.get("/CurrentUser")
@router.get("/currentUser")
async def current_user_api(request: Request):
    from fastapi.responses import JSONResponse

    user = auth_mod.current_user(request, on_timeout=audit.on_token_timeout)
    if not user:
        return JSONResponse(
            status_code=401,
            content={
                "code": 401,
                "msg": "请先登录",
                "data": {"isLogin": False},
                "success": True,
                "errorCode": "401",
                "errorMessage": "登录已过期或未登录，请重新登录！",
            },
        )
    return ok(_public_user(user))


@router.get("/users")
async def users():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY userid").fetchall()
    return ok([_public_user(dict(r)) for r in rows])


@router.post("/user/add")
async def user_add(request: Request):
    body = await request.json()
    userid = body.get("userid") or new_id()[:8]
    plain = body.get("password") or "bifang.intronlink"
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO users (userid, username, password, name, access, email, phone, org_code, org_name, unit, dept, address, signature, avatar, user_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                userid,
                body.get("username"),
                hash_password(plain),
                body.get("name") or body.get("username"),
                body.get("access") or "user",
                body.get("email") or "",
                body.get("phone") or "",
                body.get("org_code") or "",
                body.get("org_name") or "",
                body.get("unit") or "",
                body.get("dept") or "",
                body.get("address") or "",
                body.get("signature") or "",
                body.get("avatar") or "",
                1 if body.get("user_status", True) else 0,
            ),
        )
    return ok(msg="添加成功")


@router.post("/user/update")
async def user_update(request: Request):
    body = await request.json()
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE users SET name=?, access=?, email=?, phone=?, org_code=?, org_name=?,
                   unit=?, dept=?, address=?, signature=?, avatar=?, user_status=?
            WHERE username=?
            """,
            (
                body.get("name"),
                body.get("access"),
                body.get("email"),
                body.get("phone"),
                body.get("org_code"),
                body.get("org_name"),
                body.get("unit"),
                body.get("dept"),
                body.get("address"),
                body.get("signature"),
                body.get("avatar"),
                1 if body.get("user_status", True) else 0,
                body.get("username"),
            ),
        )
        if body.get("password"):
            conn.execute(
                "UPDATE users SET password=? WHERE username=?",
                (hash_password(body.get("password")), body.get("username")),
            )
    return ok(msg="更新成功")


@router.get("/user/delete")
async def user_delete(userid: str = Query(""), username: str = Query("")):
    with get_conn() as conn:
        if userid:
            conn.execute("DELETE FROM users WHERE userid=?", (userid,))
        elif username:
            conn.execute("DELETE FROM users WHERE username=?", (username,))
    return ok(msg="删除成功")


@router.put("/user/password")
async def change_password(request: Request):
    body = await request.json()
    user_id = body.get("userId")
    old_pwd = body.get("oldPwd")
    new_pwd = body.get("newPwd")
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE userid=?", (user_id,)).fetchone()
        if not row:
            row = conn.execute("SELECT * FROM users WHERE username=?", (user_id,)).fetchone()
        if not row:
            return fail("用户不存在", 404)
        if not verify_password(old_pwd or "", row["password"] or ""):
            return fail("原密码错误", 400)
        conn.execute(
            "UPDATE users SET password=? WHERE userid=?",
            (hash_password(new_pwd or ""), row["userid"]),
        )
    return ok(msg="密码修改成功")


@router.get("/user/logs")
async def user_logs(
    request: Request,
    user: str = Query(""),
    action: str = Query(""),
    event: str = Query(""),
    result: str = Query(""),
    query: str = Query(""),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    start: str = Query(""),
    end: str = Query(""),
):
    actor = auth_mod.require_user(request, on_timeout=audit.on_token_timeout)
    if (actor.get("access") or "") != "admin":
        return fail("无权限", 403)
    clauses: list[str] = ["1=1"]
    params: list[Any] = []
    if user:
        clauses.append("user=?")
        params.append(user)
    if action:
        clauses.append("action=?")
        params.append(action)
    if event:
        clauses.append("event=?")
        params.append(event)
    if result:
        clauses.append("result=?")
        params.append(result)
    if query:
        clauses.append("(url LIKE ? OR fcn LIKE ? OR menu LIKE ? OR target LIKE ?)")
        params.extend([f"%{query}%"] * 4)
    if start:
        clauses.append("record_time>=?")
        params.append(start)
    if end:
        clauses.append("record_time<=?")
        params.append(end)
    where = " AND ".join(clauses)
    offset = (page - 1) * size
    with get_conn() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM user_logs WHERE {where}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM user_logs WHERE {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            [*params, size, offset],
        ).fetchall()
    return ok({"list": rows_to_list(list(rows)), "total": int(total), "page": page, "size": size})


@router.get("/login/logs")
async def login_logs(
    request: Request,
    user: str = Query(""),
    event: str = Query(""),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    start: str = Query(""),
    end: str = Query(""),
):
    actor = auth_mod.require_user(request, on_timeout=audit.on_token_timeout)
    if (actor.get("access") or "") != "admin":
        return fail("无权限", 403)
    clauses: list[str] = ["1=1"]
    params: list[Any] = []
    if user:
        clauses.append("username=?")
        params.append(user)
    if event:
        clauses.append("event=?")
        params.append(event)
    if start:
        clauses.append("COALESCE(record_time, login_at, logout_at, '')>=?")
        params.append(start)
    if end:
        clauses.append("COALESCE(record_time, login_at, logout_at, '')<=?")
        params.append(end)
    where = " AND ".join(clauses)
    offset = (page - 1) * size
    with get_conn() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM login_logs WHERE {where}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"SELECT * FROM login_logs WHERE {where} ORDER BY COALESCE(record_time, login_at, logout_at, '') DESC, id DESC LIMIT ? OFFSET ?",
            [*params, size, offset],
        ).fetchall()
    return ok({"list": rows_to_list(list(rows)), "total": int(total), "page": page, "size": size})


@router.post("/user-log")
async def post_user_log(request: Request):
    """前端上报 page_view / gen_* / export_* 等白名单动作。"""
    actor = auth_mod.require_user(request, on_timeout=audit.on_token_timeout)
    body = await request.json()
    action = str(body.get("action") or "").strip()
    if action not in audit.FRONTEND_ACTIONS:
        return fail("action 不在白名单", 400)
    ip, _ua = auth_mod.client_meta(request)
    audit.write_user_log(
        user=actor.get("username") or "",
        name=actor.get("name") or "",
        client_ip=ip,
        url=str(body.get("url") or "")[:500],
        module=str(body.get("module") or ""),
        menu=str(body.get("menu") or ""),
        event=str(body.get("event") or ("view" if action == "page_view" else "action")),
        action=action,
        target=str(body.get("target") or "")[:200],
        result=str(body.get("result") or "ok")[:32],
        detail=str(body.get("detail") or "")[:500],
        session_id=actor.get("_session_id") or "",
        duration_ms=int(body.get("duration_ms") or 0),
    )
    return ok(msg="logged")


# ---- 菜单 ----
@router.get("/menus")
async def menus():
    with get_conn() as conn:
        rows = conn.execute('SELECT * FROM menus ORDER BY "order", id').fetchall()
    return ok(rows_to_list(rows))


@router.get("/tree_menus")
async def tree_menus():
    with get_conn() as conn:
        rows = rows_to_list(conn.execute('SELECT * FROM menus ORDER BY "order", id').fetchall())
    nodes = {r["id"]: {**r, "children": []} for r in rows}
    roots = []
    for r in rows:
        node = nodes[r["id"]]
        pid = r.get("p_id") or 0
        if pid and pid in nodes:
            nodes[pid]["children"].append(node)
        else:
            roots.append(node)
    return ok(roots)


@router.post("/menu/add")
async def menu_add(request: Request):
    body = await request.json()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO menus (zh_name, name, access, icon, path, cmct, "order", p_id, remark, hide_menu_flag, sys_menu_flag, module_menu_flag)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                body.get("zh_name"),
                body.get("name"),
                body.get("access"),
                body.get("icon") or "",
                body.get("path") or "",
                body.get("cmct") or "",
                body.get("order") or 0,
                body.get("p_id") or 0,
                body.get("remark") or "",
                1 if body.get("hide_menu_flag") else 0,
                1 if body.get("sys_menu_flag") else 0,
                body.get("module_menu_flag") or "",
            ),
        )
    return ok(msg="添加成功")


@router.post("/menu/update")
async def menu_update(request: Request):
    body = await request.json()
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE menus SET zh_name=?, name=?, access=?, icon=?, path=?, cmct=?, "order"=?, p_id=?, remark=?,
                   hide_menu_flag=?, sys_menu_flag=?, module_menu_flag=?
            WHERE id=?
            """,
            (
                body.get("zh_name"),
                body.get("name"),
                body.get("access"),
                body.get("icon"),
                body.get("path"),
                body.get("cmct"),
                body.get("order") or 0,
                body.get("p_id") or 0,
                body.get("remark"),
                1 if body.get("hide_menu_flag") else 0,
                1 if body.get("sys_menu_flag") else 0,
                body.get("module_menu_flag") or "",
                body.get("id"),
            ),
        )
    return ok(msg="更新成功")


@router.get("/menu/delete")
async def menu_delete(menu_id: int = Query(0), menu_name: str = Query("")):
    with get_conn() as conn:
        if menu_id:
            conn.execute("DELETE FROM menus WHERE id=?", (menu_id,))
        elif menu_name:
            conn.execute("DELETE FROM menus WHERE name=?", (menu_name,))
    return ok(msg="删除成功")


# ---- 角色 ----
@router.get("/roles")
async def roles():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM roles ORDER BY id").fetchall()
    data = []
    for r in rows_to_list(rows):
        r["sys_role_flag"] = bool(r.get("sys_role_flag"))
        r["role_status"] = bool(r.get("role_status"))
        data.append(r)
    return ok(data)


@router.post("/role/add")
async def role_add(request: Request):
    body = await request.json()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO roles (role_code, role_name, role_desc, sys_role_flag, role_status, update_time)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                body.get("role_code"),
                body.get("role_name"),
                body.get("role_desc") or "",
                1 if body.get("sys_role_flag") else 0,
                1 if body.get("role_status", True) else 0,
                _now(),
            ),
        )
    return ok(msg="添加成功")


@router.post("/role/update")
async def role_update(request: Request):
    body = await request.json()
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE roles SET role_name=?, role_desc=?, role_status=?, update_time=?
            WHERE role_code=?
            """,
            (
                body.get("role_name"),
                body.get("role_desc"),
                1 if body.get("role_status", True) else 0,
                _now(),
                body.get("role_code"),
            ),
        )
    return ok(msg="更新成功")


@router.get("/role/delete")
async def role_delete(role_code: str = Query(""), role_name: str = Query("")):
    with get_conn() as conn:
        conn.execute("DELETE FROM roles WHERE role_code=?", (role_code,))
        conn.execute("DELETE FROM role_res WHERE role_code=?", (role_code,))
    return ok(msg="删除成功")


@router.get("/cur_user_role_menus")
@router.get("/role_menus")
async def role_menus(user_name: str = Query(""), role_code: str = Query("")):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM role_res WHERE role_code=? AND res_type='menu'",
            (role_code,),
        ).fetchall()
    return ok(rows_to_list(rows))


@router.post("/role/add_role_menus")
async def add_role_menus(request: Request):
    body = await request.json()
    if not body:
        return ok(msg="空权限")
    role_code = body[0].get("role_code")
    with get_conn() as conn:
        conn.execute("DELETE FROM role_res WHERE role_code=? AND res_type='menu'", (role_code,))
        for item in body:
            conn.execute(
                "INSERT INTO role_res (auth_res, res_type, res_status, role_code) VALUES (?, 'menu', ?, ?)",
                (item.get("auth_res"), item.get("res_status") or "1", role_code),
            )
    return ok(msg="保存成功")


@router.get("/role_kbs")
async def role_kbs(user_name: str = Query(""), role_code: str = Query("")):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM role_res WHERE role_code=? AND res_type='kb'",
            (role_code,),
        ).fetchall()
        data = rows_to_list(rows)
        # admin 默认拥有全部知识库
        if role_code == "admin" and not data:
            kbs = conn.execute("SELECT kb_name FROM knowledge_bases").fetchall()
            data = [
                {"auth_res": r["kb_name"], "res_type": "kb", "res_status": "1", "role_code": "admin"}
                for r in kbs
            ]
    return ok(data)


@router.post("/role/add_role_kbs")
async def add_role_kbs(request: Request):
    body = await request.json()
    if not body:
        return ok(msg="空权限")
    role_code = body[0].get("role_code")
    with get_conn() as conn:
        conn.execute("DELETE FROM role_res WHERE role_code=? AND res_type='kb'", (role_code,))
        for item in body:
            conn.execute(
                "INSERT INTO role_res (auth_res, res_type, res_status, role_code) VALUES (?, 'kb', ?, ?)",
                (item.get("auth_res"), item.get("res_status") or "1", role_code),
            )
    return ok(msg="保存成功")


# ---- 机构 ----
@router.get("/orgs")
async def orgs():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM orgs ORDER BY id").fetchall()
    return ok(rows_to_list(rows))


@router.get("/tree_orgs")
async def tree_orgs():
    with get_conn() as conn:
        rows = rows_to_list(conn.execute("SELECT * FROM orgs ORDER BY id").fetchall())
    nodes = {r["id"]: {**r, "children": []} for r in rows}
    roots = []
    for r in rows:
        node = nodes[r["id"]]
        pid = r.get("pid") or 0
        if pid and pid in nodes:
            nodes[pid]["children"].append(node)
        else:
            roots.append(node)
    return ok(roots)


@router.post("/org/add")
async def org_add(request: Request):
    body = await request.json()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO orgs (org_code, org_name, org_fn, org_desc, pid, update_time)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                body.get("org_code"),
                body.get("org_name"),
                body.get("org_fn") or "",
                body.get("org_desc") or "",
                body.get("pid") or 0,
                _now(),
            ),
        )
    return ok(msg="添加成功")


@router.post("/org/update")
async def org_update(request: Request):
    body = await request.json()
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE orgs SET org_name=?, org_fn=?, org_desc=?, pid=?, update_time=?
            WHERE org_code=?
            """,
            (
                body.get("org_name"),
                body.get("org_fn"),
                body.get("org_desc"),
                body.get("pid") or 0,
                _now(),
                body.get("org_code"),
            ),
        )
    return ok(msg="更新成功")


@router.get("/org/delete")
async def org_delete(org_id: int = Query(0), org_name: str = Query(""), pid: int = Query(0)):
    with get_conn() as conn:
        if org_id:
            conn.execute("DELETE FROM orgs WHERE id=?", (org_id,))
        elif org_name:
            conn.execute("DELETE FROM orgs WHERE org_name=?", (org_name,))
    return ok(msg="删除成功")


@router.get("/org/users")
async def org_users(org_code: str = Query(""), org_name: str = Query("")):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM users WHERE org_code=? OR (?='' AND org_code!='')",
            (org_code, org_code),
        ).fetchall()
    return ok([_public_user(dict(r)) for r in rows])


@router.get("/org/un_users")
async def un_org_users():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM users WHERE org_code IS NULL OR org_code=''"
        ).fetchall()
    return ok([_public_user(dict(r)) for r in rows])


@router.post("/org/users_remove")
async def org_users_remove(request: Request):
    usernames = await request.json()
    with get_conn() as conn:
        for u in usernames or []:
            conn.execute("UPDATE users SET org_code='', org_name='' WHERE username=?", (u,))
    return ok(msg="移除成功")


@router.post("/org/users_add")
async def org_users_add(request: Request):
    body = await request.json()
    org_code = body.get("org_code")
    org_name = body.get("org_name")
    usernames = body.get("usernames") or []
    with get_conn() as conn:
        for u in usernames:
            conn.execute(
                "UPDATE users SET org_code=?, org_name=? WHERE username=?",
                (org_code, org_name, u),
            )
    return ok(msg="添加成功")
