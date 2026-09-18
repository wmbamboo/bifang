from __future__ import annotations

import secrets
from typing import Any, Optional

from fastapi import APIRouter, Query, Request

from app.db import get_conn, ok, fail, rows_to_list, _now, new_id

router = APIRouter(prefix="/mock_api", tags=["mock_api"])

# 简易 token 存储
_TOKENS: dict[str, str] = {}


def _user_by_username(username: str) -> Optional[dict]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    return dict(row) if row else None


def _public_user(u: dict) -> dict:
    data = dict(u)
    data.pop("password", None)
    data["user_status"] = bool(data.get("user_status", 1))
    return data


@router.post("/login/account")
async def login_account(request: Request):
    body = await request.json()
    username = body.get("username") or ""
    password = body.get("password") or ""
    login_type = body.get("type") or "account"
    user = _user_by_username(username)
    if user and user.get("password") == password:
        token = secrets.token_hex(16)
        _TOKENS[token] = username
        return ok(
            {
                "status": "ok",
                "type": login_type,
                "currentAuthority": user.get("access") or "user",
                "token": token,
            },
            msg="登录成功",
        )
    return ok(
        {"status": "error", "type": login_type, "currentAuthority": "guest", "token": ""},
        msg="用户名或密码错误",
        code=200,
    )


@router.post("/login/outLogin")
async def out_login():
    return ok({}, msg="已退出")


@router.get("/CurrentUser")
@router.get("/currentUser")
async def current_user(username: str = Query("")):
    from fastapi.responses import JSONResponse

    user = _user_by_username(username or "")
    if not user:
        # 与 Ant Design Pro 约定一致：success=true，避免前端拦截器弹「请求失败」
        return JSONResponse(
            status_code=401,
            content={
                "code": 401,
                "msg": "请先登录",
                "data": {"isLogin": False},
                "success": True,
                "errorCode": "401",
                "errorMessage": "请先登录！",
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
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO users (userid, username, password, name, access, email, phone, org_code, org_name, unit, dept, address, signature, avatar, user_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                userid,
                body.get("username"),
                body.get("password") or "bifang.intronlink",
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
                (body.get("password"), body.get("username")),
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
        if row["password"] != old_pwd:
            return fail("原密码错误", 400)
        conn.execute("UPDATE users SET password=? WHERE userid=?", (new_pwd, row["userid"]))
    return ok(msg="密码修改成功")


@router.get("/user/logs")
async def user_logs(user: str = Query(""), query: str = Query("")):
    sql = "SELECT * FROM user_logs WHERE 1=1"
    params: list[Any] = []
    if user:
        sql += " AND user=?"
        params.append(user)
    if query:
        sql += " AND (url LIKE ? OR fcn LIKE ? OR menu LIKE ?)"
        params.extend([f"%{query}%"] * 3)
    sql += " ORDER BY id DESC LIMIT 200"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    return ok(rows_to_list(rows))


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
