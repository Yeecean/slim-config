import argparse
import os
import re
import shutil
import webbrowser

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from opencode_reader import (
    read_providers, fetch_new_api_models, diff_models, get_new_api_config,
    detect_format, detect_host, get_config_format,
)
import json5
import json
from slim_config import read_config, write_config, validate_config
from model_metadata import get_model_metadata, detect_vision, REASONING_LEVELS

_config_dir = os.environ.get("SLIM_CONFIG_DIR") or os.path.expanduser("~/.config/opencode")
_uvicorn_server = None
_VERSION = "1.1.0"

app = FastAPI(title="Slim Config", version=_VERSION)

# 生产模式前后端同源,无需 CORS;仅放行本地开发服务器,防止任意网页驱动本机配置写入
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def ok(data=None):
    return {"ok": True, "data": data}


def err(msg, status=400):
    return JSONResponse({"ok": False, "error": msg}, status_code=status)


def _write_opencode_config(path, raw_text):
    # 写入前备份,与 slim_config.write_config 的 .bak 机制保持一致
    if os.path.exists(path):
        shutil.copy2(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        f.write(raw_text)


def _fragment_error(payload):
    """校验写入片段;只校验片段本身,避免旧配置既有错误阻塞写路径。"""
    errors = validate_config(payload)
    if errors:
        return err(f"校验失败：{errors[0]}")
    return None


# ── Status ──────────────────────────────────────────────────────────


@app.get("/api/status")
async def get_status():
    return ok({
        "version": _VERSION,
        "config_dir": _config_dir,
        "slim_config_path": os.path.join(_config_dir, "oh-my-opencode-slim.json"),
        "opencode_config_path": os.path.join(_config_dir, "opencode.jsonc"),
        "opencode_format": get_config_format(_config_dir),
        "host": detect_host(),
    })


# ── Providers ───────────────────────────────────────────────────────


@app.get("/api/providers")
async def get_providers():
    return ok({"providers": read_providers(_config_dir)})


@app.get("/api/providers/sync/diff")
async def get_sync_diff():
    remote = fetch_new_api_models(_config_dir)
    if remote is None:
        return err("无法连接 New-API，请检查 opencode 配置文件中 new-api 节点的配置（v1: provider.new-api / v2: providers.new-api）")
    result = diff_models(_config_dir, remote)
    return ok(result)


@app.post("/api/providers/sync/apply")
async def apply_sync(data: dict):
    to_add = data.get("to_add", [])
    opencode_path = os.path.join(_config_dir, "opencode.jsonc")
    if not os.path.exists(opencode_path):
        return err("opencode.jsonc 不存在")

    with open(opencode_path, "r", encoding="utf-8") as f:
        raw = f.read()
    cfg = json5.loads(raw)
    root_key = "providers" if detect_format(cfg) == "v2" else "provider"

    new_api = cfg.setdefault(root_key, {}).setdefault("new-api", {})
    models = new_api.setdefault("models", {})
    
    added = []
    for item in to_add:
        mid = item.get("id") if isinstance(item, dict) else item
        if not isinstance(mid, str) or not mid:
            continue
        if mid not in models:
            models[mid] = {"name": mid}
            added.append(mid)

    if not added:
        return ok({"message": "没有需要添加的新模型"})

    # 先定位 provider(s) 根节点再找 new-api,避免误匹配其他位置的 new-api 键
    root_match = re.search(r'["\']' + root_key + r'["\']\s*:\s*\{', raw)
    search_from = root_match.end() if root_match else 0
    new_api_idx = re.search(r'["\']new-api["\']\s*:\s*\{', raw[search_from:])
    if new_api_idx:
        models_match = re.search(r'["\']models["\']\s*:\s*\{', raw[search_from + new_api_idx.end():])
        if models_match:
            insert_pos = search_from + new_api_idx.end() + models_match.end()
            insert_str = ""
            for mid in added:
                insert_str += "\n        " + json.dumps(mid, ensure_ascii=False) + ': ' + json.dumps({"name": mid}, ensure_ascii=False) + ','
            raw = raw[:insert_pos] + insert_str + raw[insert_pos:]
            _write_opencode_config(opencode_path, raw)
            return ok({"message": f"已添加 {len(added)} 个模型 (保留了注释)"})
    
    # Fallback to json.dumps if regex fails
    _write_opencode_config(opencode_path, json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")

    return ok({"message": f"已添加 {len(added)} 个模型 (由于正则不匹配，部分注释可能丢失)"})


@app.post("/api/providers/sync/remove")
async def remove_sync_models(data: dict):
    to_remove = data.get("to_remove", [])
    if not to_remove:
        return ok({"message": "没有需要删除的模型"})
    opencode_path = os.path.join(_config_dir, "opencode.jsonc")
    if not os.path.exists(opencode_path):
        return err("opencode.jsonc 不存在")
    with open(opencode_path, "r", encoding="utf-8") as f:
        raw = f.read()
    cfg = json5.loads(raw)
    root_key = "providers" if detect_format(cfg) == "v2" else "provider"
    models = cfg.get(root_key, {}).get("new-api", {}).get("models", {})
    removed = []
    for item in to_remove:
        mid = item.get("id") if isinstance(item, dict) else item
        if not isinstance(mid, str) or not mid:
            continue
        if mid in models:
            del models[mid]
            removed.append(mid)
    if not removed:
        return ok({"message": "没有需要删除的模型"})
    _write_opencode_config(opencode_path, json.dumps(cfg, ensure_ascii=False, indent=2) + "\n")
    return ok({"message": f"已删除 {len(removed)} 个模型", "removed": removed})


# ── Model Metadata ─────────────────────────────────────────────────


@app.get("/api/models/{provider_id}/{model_id:path}")
async def get_model_meta(provider_id: str, model_id: str):
    full_id = f"{provider_id}/{model_id}"
    meta = get_model_metadata(full_id, _config_dir)
    return ok(meta)


# ── Config ──────────────────────────────────────────────────────────


@app.get("/api/config")
async def get_config():
    return ok(read_config(_config_dir))


@app.get("/api/opencode-config")
async def get_opencode_config():
    path = os.path.join(_config_dir, "opencode.jsonc")
    if not os.path.exists(path):
        return err("opencode.jsonc 不存在")
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    try:
        parsed = json5.loads(raw)
    except Exception as e:
        return err(f"解析 opencode.jsonc 失败: {e}")
    return ok({"raw": raw, "parsed": parsed})


@app.put("/api/opencode-config")
async def put_opencode_config(data: dict):
    path = os.path.join(_config_dir, "opencode.jsonc")
    raw = data.get("raw")
    if raw is not None:
        try:
            json5.loads(raw)
        except Exception as e:
            return err(f"内容不是有效的 JSON5: {e}")
        _write_opencode_config(path, raw)
        return ok({"message": "opencode.jsonc 已保存"})
    parsed = data.get("parsed")
    if parsed is not None:
        _write_opencode_config(path, json.dumps(parsed, ensure_ascii=False, indent=2) + "\n")
        return ok({"message": "opencode.jsonc 已保存"})
    return err("请提供 raw（原始内容）或 parsed（JSON 对象）")


def _deep_update(d, u):
    for k, v in u.items():
        if isinstance(v, dict) and k in d and isinstance(d[k], dict):
            _deep_update(d[k], v)
        else:
            d[k] = v
    return d

@app.put("/api/config")
async def put_config(data: dict):
    current = read_config(_config_dir)
    merged = _deep_update(current, data)
    errors = validate_config(merged)
    if errors:
        return err(f"校验失败：{errors[0]}")
    write_config(_config_dir, merged)
    return ok({"message": "配置已保存"})


def _iter_agent_configs(data):
    """产出 (preset 名, agent 名, 配置),兼容新旧两种 preset 形态。"""
    presets = data.get("presets", {})
    if isinstance(presets, dict):
        for pname, preset in presets.items():
            if not isinstance(preset, dict):
                continue
            agents = preset.get("agents")
            if isinstance(agents, dict):
                for aname, acfg in agents.items():
                    if isinstance(acfg, dict):
                        yield pname, aname, acfg
            for aname, acfg in preset.items():
                if aname not in ("extends", "agents", "marketplace") and isinstance(acfg, dict):
                    yield pname, aname, acfg
    agents = data.get("agents", {})
    if isinstance(agents, dict):
        for aname, acfg in agents.items():
            if isinstance(acfg, dict):
                yield None, aname, acfg


def _model_string(model):
    """model 兼容 string / {id} / 数组(fallback 链),取第一个可用 id。"""
    if isinstance(model, str):
        return model
    if isinstance(model, list) and model:
        return _model_string(model[0])
    if isinstance(model, dict):
        mid = model.get("id")
        return mid if isinstance(mid, str) else None
    return None


@app.post("/api/validate")
async def validate(data: dict):
    errors = validate_config(data)
    warnings = []

    for pname, aname, acfg in _iter_agent_configs(data):
        model = _model_string(acfg.get("model"))
        if model and aname == "observer":
            model_id = model.split("/", 1)[-1] if "/" in model else model
            if not detect_vision(model_id):
                where = f"presets「{pname}」" if pname else "agents"
                warnings.append(
                    f"提示：{where} → 「{aname}」的模型「{model}」可能不支持视觉能力，"
                    f"observer 角色建议使用支持 vision 的模型"
                )

    if errors:
        return err(f"{errors[0]}")
    return ok({"valid": True, "warnings": warnings})


# ── Presets ─────────────────────────────────────────────────────────


@app.get("/api/presets")
async def get_presets():
    cfg = read_config(_config_dir)
    return ok({
        "presets": cfg.get("presets", {}),
        "active": cfg.get("preset"),
    })


@app.put("/api/active-preset")
async def set_active_preset(data: dict):
    name = data.get("preset")
    if not name:
        return err("请指定 preset 名称")
    cfg = read_config(_config_dir)
    if name not in cfg.get("presets", {}):
        return err(f"Preset 「{name}」不存在")
    cfg["preset"] = name
    write_config(_config_dir, cfg)
    return ok({"message": f"已切换到 Preset: {name}"})


@app.post("/api/presets")
async def create_preset(data: dict):
    name = data.get("name")
    if not name:
        return err("请指定 preset 名称")
    agents = data.get("agents", {})
    cfg = read_config(_config_dir)
    if name in cfg.get("presets", {}):
        return err(f"Preset 「{name}」已存在")
    presets_ctx = {k: {} for k in cfg.get("presets", {})}
    presets_ctx[name] = agents
    invalid = _fragment_error({"presets": presets_ctx})
    if invalid:
        return invalid
    cfg.setdefault("presets", {})[name] = agents
    write_config(_config_dir, cfg)
    return ok({"message": f"Preset 「{name}」已创建"})


@app.put("/api/presets/{name}")
async def update_preset(name: str, data: dict):
    cfg = read_config(_config_dir)
    if name not in cfg.get("presets", {}):
        return err(f"Preset 「{name}」不存在")
    presets_ctx = {k: {} for k in cfg.get("presets", {})}
    presets_ctx[name] = data
    invalid = _fragment_error({"presets": presets_ctx})
    if invalid:
        return invalid
    cfg["presets"][name] = data
    write_config(_config_dir, cfg)
    return ok({"message": f"Preset 「{name}」已更新"})


@app.delete("/api/presets/{name}")
async def delete_preset(name: str):
    cfg = read_config(_config_dir)
    if name not in cfg.get("presets", {}):
        return err(f"Preset 「{name}」不存在")
    if cfg.get("preset") == name:
        return err(f"不能删除当前激活的 Preset「{name}」，请先切换到其他 Preset")
    del cfg["presets"][name]
    write_config(_config_dir, cfg)
    return ok({"message": f"Preset 「{name}」已删除"})


# ── Custom Agents ───────────────────────────────────────────────────


@app.get("/api/agents")
async def get_agents():
    cfg = read_config(_config_dir)
    return ok({"agents": cfg.get("agents", {})})


@app.put("/api/agents/{name}")
async def update_agent(name: str, data: dict):
    invalid = _fragment_error({"agents": {name: data}})
    if invalid:
        return invalid
    cfg = read_config(_config_dir)
    cfg.setdefault("agents", {})[name] = data
    write_config(_config_dir, cfg)
    return ok({"message": f"Agent 「{name}」已保存"})


@app.delete("/api/agents/{name}")
async def delete_agent(name: str):
    cfg = read_config(_config_dir)
    if name in cfg.get("agents", {}):
        del cfg["agents"][name]
        write_config(_config_dir, cfg)
    return ok({"message": f"Agent 「{name}」已删除"})


# ── Companion ───────────────────────────────────────────────────────


@app.get("/api/companion")
async def get_companion():
    cfg = read_config(_config_dir)
    return ok(cfg.get("companion", {}))


@app.put("/api/companion")
async def update_companion(data: dict):
    invalid = _fragment_error({"companion": data})
    if invalid:
        return invalid
    cfg = read_config(_config_dir)
    cfg["companion"] = data
    write_config(_config_dir, cfg)
    return ok({"message": "Companion 配置已保存"})


# ── Shutdown ────────────────────────────────────────────────────────


@app.post("/api/shutdown")
async def shutdown():
    global _uvicorn_server
    if _uvicorn_server:
        _uvicorn_server.should_exit = True
    return ok({"message": "服务器正在关闭..."})


# ── Static Files ───────────────────────────────────────────────────

static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir, exist_ok=True)
    with open(os.path.join(static_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write("<html><body><h1>Slim Config Backend ready. Frontend not built yet.</h1></body></html>")

from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


# ── Entry ───────────────────────────────────────────────────────────


def parse_args():
    parser = argparse.ArgumentParser(
        description="Slim Config — OpenCode API 配置工具"
    )
    parser.add_argument(
        "--port", type=int, default=8080,
        help="监听端口 (默认: 8080)",
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
        help="监听地址 (默认: 127.0.0.1)",
    )
    parser.add_argument(
        "--config-dir", default=None,
        help="OpenCode 配置目录路径 (默认: ~/.config/opencode)",
    )
    return parser.parse_args()


def main():
    global _config_dir, _uvicorn_server

    args = parse_args()

    config_dir = args.config_dir or os.environ.get("SLIM_CONFIG_DIR")
    if config_dir:
        _config_dir = os.path.abspath(config_dir)

    url = f"http://{args.host}:{args.port}"
    print(f"Slim Config v{_VERSION}")
    print(f"配置目录: {_config_dir}")
    print(f"访问地址: {url}")
    print()

    webbrowser.open(url)

    config = uvicorn.Config(
        app=app,
        host=args.host,
        port=args.port,
        log_level="info",
    )
    _uvicorn_server = uvicorn.Server(config)
    _uvicorn_server.run()


if __name__ == "__main__":
    main()
