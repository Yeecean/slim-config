import os
import json5
import urllib.request
import json


def _load_config(config_dir):
    path = os.path.join(config_dir, "opencode.jsonc")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json5.load(f)


import subprocess

def read_providers(config_dir):
    data = _load_config(config_dir)
    providers = data.get("provider", {})
    
    # Base providers from opencode.jsonc
    result_dict = {}
    for pid, pcfg in providers.items():
        models = pcfg.get("models", {})
        model_list = [
            {"id": mid, "name": minfo.get("name", mid)}
            for mid, minfo in models.items()
        ]
        result_dict[pid] = {
            "id": pid,
            "name": pcfg.get("name", pid),
            "models": model_list,
        }
        
    # Merge with `opencode models` CLI output
    try:
        proc = subprocess.run(["opencode", "models"], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10)
        if proc.returncode == 0:
            lines = proc.stdout.strip().split("\n")
            for line in lines:
                line = line.strip()
                if not line or "/" not in line:
                    continue
                # opencode models outputs like "provider/model_id" or "provider/namespace/model_id"
                pid, mid = line.split("/", 1)
                
                if pid not in result_dict:
                    result_dict[pid] = {
                        "id": pid,
                        "name": pid.capitalize(), # Use capitalized ID as fallback name
                        "models": []
                    }
                
                # Check if model already exists
                existing = [m for m in result_dict[pid]["models"] if m["id"] == mid]
                if not existing:
                    result_dict[pid]["models"].append({"id": mid, "name": mid})
    except Exception as e:
        print(f"Failed to fetch opencode models from CLI: {e}")

    return list(result_dict.values())


def get_new_api_config(config_dir):
    data = _load_config(config_dir)
    pcfg = data.get("provider", {}).get("new-api")
    if not pcfg:
        return None
    return {
        "baseURL": pcfg.get("options", {}).get("baseURL", "http://localhost:3000/v1"),
        "apiKey": pcfg.get("options", {}).get("apiKey", ""),
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

    data = _load_config(config_dir)
    current = set(data.get("provider", {}).get("new-api", {}).get("models", {}).keys())
    remote = set(remote_models)

    to_add = sorted(remote - current)
    to_remove = sorted(current - remote)

    return {
        "to_add": [{"id": mid, "name": mid} for mid in to_add],
        "to_remove": [{"id": mid} for mid in to_remove],
        "current_count": len(current),
        "remote_count": len(remote),
    }
