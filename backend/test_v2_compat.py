"""v1/v2 双格式自适应兼容性测试(无需真实 OpenCode 环境)。

运行: python test_v2_compat.py
覆盖: 格式检测 / 归一化 IR / new-api 定位 / diff / 注入(注释保留) /
      校验器新 schema / observer 警告兼容 model 数组。
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

import json5

import opencode_reader
from slim_config import validate_config

PORT = 8123
BASE = f"http://127.0.0.1:{PORT}"

V1_CONFIG = """{
  // v1 格式样例:这行注释必须被保留
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "new-api": {
      // new-api 渠道注释
      "options": {
        "baseURL": "http://127.0.0.1:13000/v1",
        "apiKey": "sk-test"
      },
      "models": {
        "gpt-test": { "name": "GPT Test" }
      }
    }
  }
}
"""

V2_CONFIG = """{
  // v2 格式样例:这行注释必须被保留
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "new-api": {
      // new-api 渠道注释
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:13000/v1",
        "apiKey": "sk-test"
      },
      "models": {
        "gpt-test": { "name": "GPT Test" }
      }
    }
  }
}
"""


def start_mock_new_api(port=13000):
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"data": [{"id": "gpt-test"}, {"id": "gpt-mock"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    srv = HTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

# omo-slim v2.2.25 schema 风格的新字段样例,校验必须全部通过
SLIM_V2_SCHEMA = {
    "preset": "base",
    "setDefaultAgent": True,
    "image_routing": "auto",
    "disabled_agents": ["councillor"],
    "presets": {
        "base": {
            "orchestrator": {
                "model": ["openai/gpt-6-sol", {"id": "anthropic/claude-opus-4-8", "variant": "high"}],
                "variant": "max",
                "skills": ["*"],
                "mcps": ["*", "!context7"],
            },
            "observer": {"model": "openai/gpt-6-luna", "skills_add": ["simplify"]},
        },
        "design": {
            "extends": "base",
            "agents": {
                "designer": {
                    "model": "gemini/gemini-3.5-flash",
                    "color": "#FF00AA",
                    "permission": {"edit": "ask", "bash": {"git push *": "deny"}},
                }
            },
        },
    },
    "agents": {
        "reviewer": {
            "model": {"id": "openai/gpt-5.2", "variant": "medium"},
            "displayName": "Reviewer",
            "description": "代码审查",
            "inheritModelFrom": "orchestrator",
            "skills_include_local": True,
            "orchestratorPrompt": "route",
            "options": {"anything": 1},
        }
    },
    "companion": {
        "enabled": True, "position": "top-left", "size": "large",
        "loopStyle": "smooth", "speed": 1.5, "debug": False,
        "gifPack": "default", "binaryPath": "C:/x/y.exe",
    },
    "backgroundJobs": {"strategy": "latest"},
}


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode("utf-8"))


def start_server():
    import uvicorn
    import main
    server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=PORT,
                                           log_level="critical"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/api/status", timeout=1)
            return main, server
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("测试服务器启动失败")


def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main_test():
    tmp = tempfile.mkdtemp(prefix="slimcfg-test-")
    v1_dir = os.path.join(tmp, "v1")
    v2_dir = os.path.join(tmp, "v2")
    os.makedirs(v1_dir)
    os.makedirs(v2_dir)
    with open(os.path.join(v1_dir, "opencode.jsonc"), "w", encoding="utf-8") as f:
        f.write(V1_CONFIG)
    with open(os.path.join(v2_dir, "opencode.jsonc"), "w", encoding="utf-8") as f:
        f.write(V2_CONFIG)
    with open(os.path.join(v2_dir, "oh-my-opencode-slim.json"), "w", encoding="utf-8") as f:
        json.dump(SLIM_V2_SCHEMA, f, ensure_ascii=False)

    try:
        # ── 单元: 格式检测与归一化 ──
        p1, p2 = json5.loads(V1_CONFIG), json5.loads(V2_CONFIG)
        assert opencode_reader.detect_format(p1) == "v1"
        assert opencode_reader.detect_format(p2) == "v2"
        m1 = opencode_reader.normalize_providers(p1)
        m2 = opencode_reader.normalize_providers(p2)
        assert m1["new-api"]["settings"]["baseURL"] == "http://127.0.0.1:13000/v1"
        assert m2["new-api"]["settings"] == m1["new-api"]["settings"]
        assert opencode_reader.get_new_api_config(v1_dir) == opencode_reader.get_new_api_config(v2_dir)
        d1 = opencode_reader.diff_models(v1_dir, ["gpt-test", "gpt-new"])
        d2 = opencode_reader.diff_models(v2_dir, ["gpt-test", "gpt-new"])
        assert d1 == d2 and d1["to_add"] == [{"id": "gpt-new", "name": "gpt-new"}]
        assert d1["current_count"] == 1
        print("[PASS] 格式检测 / 归一化 / new-api 定位 / diff 双格式一致")

        # ── 校验器: 新 schema 通过,坏值报错 ──
        assert validate_config(SLIM_V2_SCHEMA) == []
        bad = {"presets": {"p": {"a": {"color": "red", "variant": 123, "model": [],
                                       "permission": "wrong", "inheritModelFrom": "x"}}},
               "image_routing": "wrong", "setDefaultAgent": "yes",
               "backgroundJobs": [], "agents": "no"}
        errs = validate_config(bad)
        for kw in ("color", "variant", "model", "permission", "inheritModelFrom",
                   "image_routing", "setDefaultAgent", "backgroundJobs", "agents"):
            assert any(kw in e for e in errs), f"缺少 {kw} 的报错: {errs}"
        errs = validate_config({"presets": {"a": {"extends": "missing"}}})
        assert any("missing" in e for e in errs)
        errs = validate_config({"presets": {"a": {"extends": "b"}, "b": {"extends": "a"}}})
        assert any("循环" in e for e in errs)
        errs = validate_config({"preset": "nope", "presets": {"a": {}}})
        assert any("nope" in e for e in errs)
        assert validate_config({}) == []
        # model 空字符串是前端新建 Agent 的合法中间态,不得误拒
        assert validate_config({"agents": {"a": {"model": ""}}}) == []
        # host 版本解析兼容带前缀输出
        assert opencode_reader._parse_host_version("2.0.7")[1] == "v2"
        assert opencode_reader._parse_host_version("opencode 1.18.34")[1] == "v1"
        assert opencode_reader._parse_host_version("") == (None, None)
        assert opencode_reader._parse_host_version("unknown-build")[1] is None
        print("[PASS] 校验器新 schema 兼容与坏值拦截 / extends 循环 / host 版本解析")

        # ── API 端到端: v1 ──
        main_mod, server = start_server()
        main_mod._config_dir = v1_dir

        st = call("GET", "/api/status")
        assert st["data"]["opencode_format"] == "v1"
        pr = call("GET", "/api/providers")
        assert "new-api" in [p["id"] for p in pr["data"]["providers"]]
        assert any(m["id"] == "gpt-test" for m in pr["data"]["providers"][0]["models"])

        # 注释保留断言必须在首次写入时验证(remove 走 json.dumps 重写,属既有已知行为)
        call("POST", "/api/providers/sync/apply", {"to_add": [{"id": "gpt-new"}]})
        raw = read(os.path.join(v1_dir, "opencode.jsonc"))
        assert "gpt-new" in raw and "v1 格式样例" in raw and "new-api 渠道注释" in raw
        assert os.path.exists(os.path.join(v1_dir, "opencode.jsonc.bak")), "写入前应生成 .bak"
        cfg = json5.loads(raw)
        assert cfg["provider"]["new-api"]["models"]["gpt-new"] == {"name": "gpt-new"}
        call("POST", "/api/providers/sync/remove", {"to_remove": [{"id": "gpt-new"}]})
        cfg = json5.loads(read(os.path.join(v1_dir, "opencode.jsonc")))
        assert "gpt-new" not in cfg["provider"]["new-api"]["models"]

        # 非字符串 / 空 id 应被跳过
        rg = call("POST", "/api/providers/sync/apply",
                  {"to_add": [{"id": ""}, {"id": 123}, {"id": "gpt-guard"}]})
        assert rg["data"]["message"].startswith("已添加 1 个"), rg
        call("POST", "/api/providers/sync/remove", {"to_remove": [{"id": "gpt-guard"}]})
        cfg = json5.loads(read(os.path.join(v1_dir, "opencode.jsonc")))
        assert "gpt-guard" not in cfg["provider"]["new-api"]["models"]
        print("[PASS] v1: status/providers/apply(注释保留,.bak)/remove/非字符串 id 跳过")

        vr = call("POST", "/api/validate", SLIM_V2_SCHEMA)
        assert vr["ok"] and vr["data"]["valid"] is True
        bad_obs = {"presets": {"p": {"observer": {"model": ["openai/gpt-6-luna"]}}}}
        vw = call("POST", "/api/validate", bad_obs)
        assert vw["data"]["warnings"], f"应包含 observer 视觉警告: {vw}"
        print("[PASS] /api/validate 兼容数组 model 的 observer 警告")

        # 写端点局部校验:坏值 400,合法中间态(model 为空)通过
        bad_save = call("PUT", "/api/agents/bad-agent",
                        {"model": "", "variant": "medium", "temperature": 5.0})
        assert bad_save["ok"] is False and "temperature" in bad_save["error"], bad_save
        ok_save = call("PUT", "/api/agents/new-agent",
                       {"model": "", "variant": "medium", "temperature": 0.5})
        assert ok_save["ok"] is True
        bad_comp = call("PUT", "/api/companion", {"speed": 9})
        assert bad_comp["ok"] is False and "speed" in bad_comp["error"]
        print("[PASS] 写端点(agent/companion)局部校验")

        # ── API 端到端: v2 ──
        main_mod._config_dir = v2_dir

        st = call("GET", "/api/status")
        assert st["data"]["opencode_format"] == "v2"
        pr = call("GET", "/api/providers")
        assert "new-api" in [p["id"] for p in pr["data"]["providers"]]

        call("POST", "/api/providers/sync/apply", {"to_add": [{"id": "gpt-new"}]})
        raw = read(os.path.join(v2_dir, "opencode.jsonc"))
        assert "gpt-new" in raw and "v2 格式样例" in raw and "new-api 渠道注释" in raw
        cfg = json5.loads(raw)
        assert cfg["providers"]["new-api"]["models"]["gpt-new"] == {"name": "gpt-new"}
        assert "provider" not in cfg, "v2 文件中不得出现 v1 根节点"
        call("POST", "/api/providers/sync/remove", {"to_remove": [{"id": "gpt-new"}]})
        cfg = json5.loads(read(os.path.join(v2_dir, "opencode.jsonc")))
        assert "gpt-new" not in cfg["providers"]["new-api"]["models"]
        mock = start_mock_new_api()
        dc = call("GET", "/api/providers/sync/diff")
        assert dc["ok"] and dc["data"]["current_count"] == 1
        assert dc["data"]["to_add"] == [{"id": "gpt-mock", "name": "gpt-mock"}]
        assert dc["data"]["remote_count"] == 2
        print("[PASS] v2: status/providers/apply(注释保留,无 v1 根节点)/remove/diff(含 mock New-API)")

        server.should_exit = True
        print("\n[ALL PASS] v1/v2 双格式自适应验证全部通过")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main_test()