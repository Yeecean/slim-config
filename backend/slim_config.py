import json
import os
import shutil
import tempfile

CONFIG_FILENAME = "oh-my-opencode-slim.json"


def read_config(config_dir):
    path = os.path.join(config_dir, CONFIG_FILENAME)
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_config(config_dir, data):
    path = os.path.join(config_dir, CONFIG_FILENAME)
    backup_path = path + ".bak"

    if os.path.exists(path):
        shutil.copy2(path, backup_path)

    fd, tmp_path = tempfile.mkstemp(dir=config_dir, suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


_VALID_POSITIONS = frozenset({"bottom-right", "bottom-left", "top-right", "top-left"})
_VALID_SIZES = frozenset({"small", "medium", "large"})
_VALID_LOOP = frozenset({"classic", "smooth"})


def validate_config(data):
    errors = []

    presets = data.get("presets", {})
    if not isinstance(presets, dict):
        errors.append("presets 必须是对象")
        return errors

    for pname, agents in presets.items():
        if not isinstance(agents, dict):
            errors.append(f"presets。「{pname}」必须是对象")
            continue
        for aname, acfg in agents.items():
            if not isinstance(acfg, dict):
                errors.append(f"presets。「{pname}」→「{aname}」必须是对象")
                continue
            errors.extend(_check_agent(acfg, f"presets。「{pname}」→「{aname}」"))

    agents = data.get("agents", {})
    if isinstance(agents, dict):
        for aname, acfg in agents.items():
            if isinstance(acfg, dict):
                errors.extend(_check_agent(acfg, f"agents。「{aname}」"))

    companion = data.get("companion", {})
    if isinstance(companion, dict):
        errors.extend(_check_companion(companion))

    return errors


def _check_agent(cfg, prefix):
    errors = []

    temp = cfg.get("temperature")
    if temp is not None:
        try:
            t = float(temp)
            if t < 0 or t > 2:
                errors.append(f"{prefix} → temperature: {temp} 超出范围 0.0 ~ 2.0")
        except (ValueError, TypeError):
            errors.append(f"{prefix} → temperature: {temp} 不是有效数字")

    model = cfg.get("model")
    if model is not None and not isinstance(model, str):
        errors.append(f"{prefix} → model: 必须是字符串")

    return errors


def _check_companion(cfg):
    errors = []

    speed = cfg.get("speed")
    if speed is not None:
        try:
            s = float(speed)
            if s < 0.25 or s > 4:
                errors.append(f"companion → speed: {speed} 超出范围 0.25 ~ 4.0")
        except (ValueError, TypeError):
            errors.append(f"companion → speed: {speed} 不是有效数字")

    pos = cfg.get("position")
    if pos is not None and pos not in _VALID_POSITIONS:
        errors.append(f"companion → position: 「{pos}」无效")

    size = cfg.get("size")
    if size is not None and size not in _VALID_SIZES:
        errors.append(f"companion → size: 「{size}」无效")

    loop = cfg.get("loopStyle")
    if loop is not None and loop not in _VALID_LOOP:
        errors.append(f"companion → loopStyle: 「{loop}」无效")

    return errors
