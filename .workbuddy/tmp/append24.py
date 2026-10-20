# -*- coding: utf-8 -*-
import io, os

base = r"\\wsl.localhost\Ubuntu\home\hezl\bifang"
src = os.path.join(base, ".workbuddy", "tmp", "ch24.md")
dst = os.path.join(base, ".workbuddy", "workbuddy-to-cursor.md")

with io.open(src, "r", encoding="utf-8") as f:
    chunk = f.read()

with io.open(dst, "a", encoding="utf-8") as f:
    f.write(chunk)

with io.open(dst, "r", encoding="utf-8") as f:
    lines = f.read().split("\n")
print("appended chars:", len(chunk))
print("total lines:", len(lines))
