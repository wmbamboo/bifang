# -*- coding: utf-8 -*-
import os

base = r"\\wsl.localhost\Ubuntu\home\hezl\bifang"
targets = [
    os.path.join(base, "frontend", "tests", "wb_review_probe.test.ts"),
    os.path.join(base, "frontend", "tmp", "probe.log"),
    os.path.join(base, ".workbuddy", "tmp", "d_vi.txt"),
    os.path.join(base, ".workbuddy", "tmp", "d_pc.txt"),
    os.path.join(base, ".workbuddy", "tmp", "d_kb.txt"),
    os.path.join(base, ".workbuddy", "tmp", "d_ai.txt"),
    os.path.join(base, ".workbuddy", "tmp", "append24.py"),
]
for t in targets:
    try:
        os.remove(t)
        print("removed:", t)
    except FileNotFoundError:
        print("missing:", t)
    except Exception as e:
        print("fail:", t, e)
