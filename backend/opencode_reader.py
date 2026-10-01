import os
import re
import json5
import urllib.request
import json
import subprocess


def _load_config(config_dir):
    path = os.path.join(config_dir, "opencode.jsonc")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json5.load(f)


def detect_format(parsed):
    # v1 顶层是单数 provider,v2 是复数 providers
    if isinstance(parsed, dict) and isinstance(parsed.get("providers"), dict) and parsed["providers"]:
        return "v2"
    return "v1"


def _parse_host_version(text):
    """从 --version 输出解析 (版本号, 格式),兼容 "2.0.7" / "opencode 1.18.34" 等形式。"""
    out = (text or "").strip().splitlines()
    version = out[0].strip() if out else None
    if not version:
        return None, None
    m = re.search(r"(\d+)\.\d+", version)
    if not m:
        return version, None
    return version, ("v2" if m.group(1) == "2" else "v1")


def detect_host():
    for cli in ("opencode2", "opencode"):
        try:
            proc = subprocess.run([cli, "--version"], capture_output=True, text=True,
                                  encoding="utf-8", errors="replace", timeout=5)
        except Exception:
            continue
        if proc.returncode != 0:
            continue
        version, fmt = _parse_host_version(proc.stdout or proc.stderr)
        return {"cli": cli, "version": version, "format": fmt}
    return {"cli": None, "version": None, "format": None}


def get_config_format(config_dir):
    return detect_format(_load_config(config_dir))


def normalize_providers(parsed):
    """把 v1 (provider.<id>.options) 与 v2 (providers.<id>.settings) 归一化为统一 IR。"""
    if not isinstance(parsed, dict):
        return {}
    raw = parsed.get("providers")
    fmt = "v2"
    if not (isinstance(raw, dict) and raw):
        raw = parsed.get("provider")
        fmt = "v1"
    if not isinstance(raw, dict):
        return {}
    result = {}
    for pid, pcfg in raw.items():
        if not isinstance(pcfg, dict):
            continue
        settings = pcfg.get("settings") if fmt == "v2" else pcfg.get("options")
        result[pid] = {
            "id": pid,
            "name": pcfg.get("name", pid),
            "format": fmt,
            "settings": settings if isinstance(settings, dict) else {},
            "models": pcfg.get("models") if isinstance(pcfg.get("models"), dict) else {},
        }
    return result


def _run_models_cli():
    host = detect_host()
    candidates = []
    if host["cli"]:
        candidates.append(host["cli"])
    for cli in ("opencode2", "opencode"):
        if cli not in candidates:
            candidates.append(cli)
    for cli in candidates:
        try:
            proc = subprocess.run([cli, "models"], capture_output=True, text=True,
                                  encoding="utf-8", errors="replace", timeout=10)
            if proc.returncode == 0 and proc.stdout.strip():
                return proc.stdout
        except Exception:
            continue
    return None


def read_providers(config_dir):
    provider_map = normalize_providers(_load_config(config_dir))

    result_dict = {}
    for pid, pcfg in provider_map.items():
        model_list = [
            {"id": mid, "name": (minfo.get("name", mid) if isinstance(minfo, dict) else mid)}
            for mid, minfo in pcfg["models"].items()
        ]
        result_dict[pid] = {"id": pid, "name": pcfg["name"], "models": model_list}

    stdout = _run_models_cli()
    if stdout:
        for line in stdout.strip().splitlines():
            line = line.strip()
            if not line or "/" not in line:
                continue
            # CLI 输出形如 "provider/model_id" 或 "provider/namespace/model_id"
            pid, mid = line.split("/", 1)
            if pid not in result_dict:
                result_dict[pid] = {"id": pid, "name": pid.capitalize(), "models": []}
            if not any(m["id"] == mid for m in result_dict[pid]["models"]):
                result_dict[pid]["models"].append({"id": mid, "name": mid})

    return list(result_dict.values())


def get_new_api_config(config_dir):
    provider_map = normalize_providers(_load_config(config_dir))
    pcfg = provider_map.get("new-api")
    if not pcfg:
        return None
    return {
        "baseURL": pcfg["settings"].get("baseURL", "http://localhost:3000/v1"),
        "apiKey": pcfg["settings"].get("apiKey", ""),
    }


def fetch_new_api_models(config_dir):
    api_cfg = get_new_api_config(config_dir)
    if not api_cfg:
        return None

    base_url = api_cfg["baseURL"].rstrip("/")
    if base_url.endswith("/v1"):
        models_url = base_url + "/models"
    else:
        models_url = base_url.rstrip("/") + "/v1/models"

    req = urllib.request.Request(
        models_url,
        headers={"Authorization": f"Bearer {api_cfg['apiKey']}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

    raw_models = body.get("data", []) if isinstance(body, dict) else body
    exclude = {"asr", "tts", "content-safety", "embedding", "rerank",
               "moderation", "midjourney", "dall-e", "whisper", "suno"}
    filtered = []
    for m in raw_models:
        mid = m.get("id", "") if isinstance(m, dict) else str(m)
        skip = False
        for ex in exclude:
            if ex in mid.lower():
                skip = True
                break
        if not skip:
            filtered.append(mid)
    return sorted(filtered)


def diff_models(config_dir, remote_models):
    if remote_models is None:
        return None

    provider_map = normalize_providers(_load_config(config_dir))
    current = set((provider_map.get("new-api", {}).get("models") or {}).keys())
    remote = set(remote_models)

    to_add = sorted(remote - current)
    to_remove = sorted(current - remote)

    return {
        "to_add": [{"id": mid, "name": mid} for mid in to_add],
        "to_remove": [{"id": mid} for mid in to_remove],
        "current_count": len(current),
        "remote_count": len(remote),
    }
