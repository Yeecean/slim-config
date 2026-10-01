import json
import os
import re
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
_THEME_COLORS = frozenset({"primary", "secondary", "accent", "success", "warning", "error", "info"})
_PERMISSION_EFFECTS = frozenset({"ask", "allow", "deny"})
_PRESET_META_KEYS = frozenset({"extends", "agents", "marketplace"})

# 顶层高级配置块只做类型保护,内部结构由插件 schema 管理
_PASSTHROUGH_OBJECTS = (
    "multiplexer", "interview", "backgroundJobs", "fallback", "council",
    "webfetch", "acpAgents",
)


def validate_config(data):
    errors = []

    if not isinstance(data, dict):
        return ["配置根必须是对象"]

    for key in ("setDefaultAgent", "compactSidebar", "stripOrchestratorModel", "autoUpdate"):
        if data.get(key) is not None and not isinstance(data[key], bool):
            errors.append(f"{key}: 必须是布尔值")

    for key in ("disabled_agents", "disabled_mcps", "disabled_tools",
                "disabled_skills", "disabled_hooks", "disabled_commands"):
        val = data.get(key)
        if val is not None and (not isinstance(val, list) or not all(isinstance(x, str) for x in val)):
            errors.append(f"{key}: 必须是字符串数组")

    if data.get("image_routing") is not None and data["image_routing"] not in ("auto", "direct"):
        errors.append(f"image_routing: 「{data['image_routing']}」无效,应为 auto/direct")

    for key in _PASSTHROUGH_OBJECTS:
        if data.get(key) is not None and not isinstance(data[key], dict):
            errors.append(f"{key}: 必须是对象")

    presets = data.get("presets", {})
    if not isinstance(presets, dict):
        errors.append("presets 必须是对象")
        presets = {}

    extends_refs = []
    for pname, preset in presets.items():
        if not isinstance(preset, dict):
            errors.append(f"presets。「{pname}」必须是对象")
            continue

        if preset.get("extends") is not None:
            if not isinstance(preset["extends"], str) or not preset["extends"]:
                errors.append(f"presets。「{pname}」→ extends: 必须是非空字符串")
            else:
                extends_refs.append((pname, preset["extends"]))

        marketplace = preset.get("marketplace")
        if marketplace is not None:
            if not isinstance(marketplace, dict):
                errors.append(f"presets。「{pname}」→ marketplace: 必须是对象")
            else:
                for key in ("agents", "agents_add", "agents_remove"):
                    val = marketplace.get(key)
                    if val is not None and (not isinstance(val, list) or not all(isinstance(x, str) for x in val)):
                        errors.append(f"presets。「{pname}」→ marketplace.{key}: 必须是字符串数组")

        agents = preset.get("agents")
        if agents is not None:
            if not isinstance(agents, dict):
                errors.append(f"presets。「{pname}」→ agents: 必须是对象")
            else:
                for aname, acfg in agents.items():
                    if not isinstance(acfg, dict):
                        errors.append(f"presets。「{pname}」→ agents。「{aname}」必须是对象")
                        continue
                    errors.extend(_check_agent(acfg, f"presets。「{pname}」→「{aname}」"))

        for aname, acfg in preset.items():
            # 旧式 preset 键即 agent 名;新式 preset 还可内联 agent 定义
            if aname in _PRESET_META_KEYS:
                continue
            if not isinstance(acfg, dict):
                errors.append(f"presets。「{pname}」→「{aname}」必须是对象")
                continue
            errors.extend(_check_agent(acfg, f"presets。「{pname}」→「{aname}」"))

    for pname, ref in extends_refs:
        # 沿继承链检查存在性,并拒绝 a→b→a 式循环
        seen = {pname}
        cur = ref
        while cur in presets and isinstance(presets[cur], dict) and isinstance(presets[cur].get("extends"), str):
            if cur in seen:
                errors.append(f"presets。「{pname}」→ extends: 存在继承循环")
                break
            seen.add(cur)
            cur = presets[cur]["extends"]
        else:
            if cur not in presets:
                errors.append(f"presets。「{pname}」→ extends: 引用的 preset「{cur}」不存在")

    preset_name = data.get("preset")
    if preset_name is not None:
        if not isinstance(preset_name, str):
            errors.append("preset: 必须是字符串")
        elif presets and preset_name not in presets:
            errors.append(f"preset: 激活的 preset「{preset_name}」不存在")

    agents = data.get("agents")
    if agents is not None:
        if isinstance(agents, dict):
            for aname, acfg in agents.items():
                if isinstance(acfg, dict):
                    errors.extend(_check_agent(acfg, f"agents。「{aname}」"))
        else:
            errors.append("agents 必须是对象")

    companion = data.get("companion")
    if companion is not None:
        if isinstance(companion, dict):
            errors.extend(_check_companion(companion))
        else:
            errors.append("companion 必须是对象")

    return errors


def _check_model(model, prefix):
    # model 兼容 string / {id, variant} / 数组(fallback 链)
    if isinstance(model, str):
        # 空字符串视为未分配(前端新建 Agent 的合法中间态,插件同样按 falsy 处理)
        return []
    if isinstance(model, dict):
        mid = model.get("id")
        if not isinstance(mid, str) or not mid:
            return [f"{prefix}: 对象形式必须包含非空字符串 id"]
        return []
    if isinstance(model, list):
        if not model:
            return [f"{prefix}: 数组不能为空"]
        errors = []
        for i, item in enumerate(model):
            errors.extend(_check_model(item, f"{prefix}[{i}]"))
        return errors
    return [f"{prefix}: 必须是字符串、对象或数组"]


def _check_permission(p, prefix):
    if p is None:
        return []
    if isinstance(p, str):
        if p not in _PERMISSION_EFFECTS:
            return [f"{prefix} → permission: 「{p}」无效,应为 ask/allow/deny"]
        return []
    if isinstance(p, dict):
        errors = []
        for tool, val in p.items():
            if isinstance(val, dict):
                for sub, v in val.items():
                    if v not in _PERMISSION_EFFECTS:
                        errors.append(f"{prefix} → permission.{tool}.{sub}: 「{v}」无效")
            elif val not in _PERMISSION_EFFECTS:
                errors.append(f"{prefix} → permission.{tool}: 「{val}」无效")
        return errors
    return [f"{prefix} → permission: 必须是字符串或对象"]


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

    if cfg.get("model") is not None:
        errors.extend(_check_model(cfg["model"], f"{prefix} → model"))

    for key in ("variant", "displayName", "description", "prompt",
                "orchestratorPrompt", "inheritModelFrom"):
        val = cfg.get(key)
        if val is not None and not isinstance(val, str):
            errors.append(f"{prefix} → {key}: 必须是字符串")

    if cfg.get("inheritModelFrom") is not None and cfg["inheritModelFrom"] not in ("session", "orchestrator"):
        errors.append(f"{prefix} → inheritModelFrom: 「{cfg['inheritModelFrom']}」无效,应为 session/orchestrator")

    color = cfg.get("color")
    if color is not None:
        valid = isinstance(color, str) and (re.fullmatch(r"#[0-9a-fA-F]{6}", color) or color in _THEME_COLORS)
        if not valid:
            errors.append(f"{prefix} → color: 「{color}」无效,应为 #RRGGBB 或主题色名")

    for key in ("skills", "skills_add", "skills_remove", "mcps"):
        val = cfg.get(key)
        if val is not None and (not isinstance(val, list) or not all(isinstance(x, str) for x in val)):
            errors.append(f"{prefix} → {key}: 必须是字符串数组")

    if cfg.get("skills_include_local") is not None and not isinstance(cfg["skills_include_local"], bool):
        errors.append(f"{prefix} → skills_include_local: 必须是布尔值")

    if cfg.get("options") is not None and not isinstance(cfg["options"], dict):
        errors.append(f"{prefix} → options: 必须是对象")

    errors.extend(_check_permission(cfg.get("permission"), prefix))

    return errors


def _check_companion(cfg):
    errors = []

    for key in ("enabled", "debug"):
        if cfg.get(key) is not None and not isinstance(cfg[key], bool):
            errors.append(f"companion → {key}: 必须是布尔值")

    for key in ("binaryPath", "gifPack"):
        if cfg.get(key) is not None and not isinstance(cfg[key], str):
            errors.append(f"companion → {key}: 必须是字符串")

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
