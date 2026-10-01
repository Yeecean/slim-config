import { useState, useEffect, useRef } from 'react'
import {
  Settings,
  User,
  Plus,
  Trash2,
  X,
  RotateCcw,
  Save,
  Info,
  Sliders,
  AlertTriangle,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Sparkles
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────

interface AgentConfig {
  model: string;
  variant: 'high' | 'medium' | 'low';
  temperature: number;
  skills: string[];
  mcps: string[];
}

interface CustomAgent extends AgentConfig {
  prompt: string;
  orchestratorPrompt: string;
  displayName?: string;
}

interface CompanionConfig {
  enabled: boolean;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  size: 'small' | 'medium' | 'large';
  loopStyle: 'classic' | 'smooth';
  speed: number;
  debug: boolean;
  gifPack: string;
}

interface FullConfig {
  preset: string;
  presets: Record<string, Record<string, AgentConfig>>;
  agents: Record<string, CustomAgent>;
  companion: CompanionConfig;
}

interface ProviderModel {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  name: string;
  models: ProviderModel[];
}

interface ServerStatus {
  version: string;
  config_dir: string;
  slim_config_path: string;
  opencode_config_path: string;
}

// ── Built-in Agents metadata ────────────────────────────────────────

const BUILTIN_AGENTS = [
  { key: 'orchestrator', name: '主控器', desc: '总体调度、分配任务' },
  { key: 'oracle', name: '顾问', desc: '架构设计、调试、代码审查' },
  { key: 'councillor', name: '评议员', desc: '评审委员会' },
  { key: 'librarian', name: '图书馆员', desc: '文档搜索、库研究' },
  { key: 'explorer', name: '探索者', desc: '代码库搜索' },
  { key: 'designer', name: '设计师', desc: 'UI/UX 实现' },
  { key: 'fixer', name: '修复者', desc: '快速实现' },
  { key: 'observer', name: '观察者', desc: '视觉/多模态任务' }
]

const DEFAULT_SKILLS = ["*", "simplify", "codemap", "diagnosing-bugs", "code-review", "deepwork"]
const DEFAULT_MCPS = ["*", "!context7", "websearch", "context7", "gh_grep"]

// ── Tag Helper Components ──────────────────────────────────────────

const TagInput = ({ 
  tags, 
  onChange, 
  suggestions, 
  placeholder 
}: { 
  tags: string[]; 
  onChange: (tags: string[]) => void; 
  suggestions: string[]; 
  placeholder: string;
}) => {
  const [input, setInput] = useState('')

  const addTag = (tagText: string) => {
    const clean = tagText.trim()
    if (!clean) return
    if (tags.includes(clean)) return
    onChange([...tags, clean])
    setInput('')
  }

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 p-2 bg-apple-bg rounded-btn border border-apple-border min-h-[38px] items-center">
        {tags.map((tag, idx) => {
          const isExclude = tag.startsWith('!')
          return (
            <span 
              key={idx} 
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                isExclude 
                  ? 'bg-red-50 text-red-600 border-red-200' 
                  : tag === '*' 
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}
            >
              {tag}
              <button 
                type="button" 
                onClick={() => removeTag(idx)} 
                className="ml-1 text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                <X size={10} strokeWidth={3} />
              </button>
            </span>
          )
        })}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag(input)
            } else if (e.key === ',' || e.key === ' ') {
              e.preventDefault()
              addTag(input)
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[60px] bg-transparent text-xs text-apple-text outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1 items-center text-[11px] text-apple-secondary">
        <span>推荐快速添加:</span>
        {suggestions.map((sug, i) => {
          const isSelected = tags.includes(sug)
          return (
            <button
              key={i}
              type="button"
              onClick={() => isSelected ? onChange(tags.filter(t => t !== sug)) : addTag(sug)}
              className={`px-1.5 py-0.5 rounded transition-all hover:bg-slate-200 border ${
                isSelected 
                  ? 'bg-slate-300 text-slate-700 border-slate-400' 
                  : 'bg-white text-apple-secondary border-apple-border shadow-sm'
              }`}
            >
              {sug}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const SearchableModelSelect = ({ 
  modelValue, 
  onSelect, 
  providers 
}: { 
  modelValue: string, 
  onSelect: (val: string) => void, 
  providers: Provider[] 
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isModelInProviders = providers.some(p =>
    p.models.some(m => `${p.id}/${m.id}` === modelValue)
  )

  const filteredProviders = providers.map(p => {
    const q = query.toLowerCase()
    const filteredModels = p.models.filter(m => 
      m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    )
    return { ...p, models: filteredModels }
  }).filter(p => p.models.length > 0)

  let displayValue = modelValue
  if (modelValue) {
    for (const p of providers) {
      const m = p.models.find(m => `${p.id}/${m.id}` === modelValue)
      if (m) {
        displayValue = `${p.name} / ${m.name}`
        break
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={() => { setIsOpen(!isOpen); setQuery('') }}
        className="w-full text-[13px] bg-white border border-apple-border rounded-btn px-3 py-2 text-apple-text shadow-sm cursor-pointer hover:border-slate-300 transition-colors flex justify-between items-center"
      >
        <span className={modelValue ? "text-apple-text truncate" : "text-apple-secondary"}>
          {modelValue ? displayValue : '-- 未配置 --'}
        </span>
        <span className="text-apple-secondary text-[10px]">▼</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-apple-border rounded-btn shadow-apple-lg overflow-hidden flex flex-col max-h-[300px]">
          <div className="p-2 border-b border-apple-border shrink-0">
            <input
              type="text"
              autoFocus
              placeholder="搜索模型 (如 glm, minimax)..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-xs text-apple-text outline-none focus:border-apple-accent"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1 space-y-1">
            {!query && (
              <div 
                className="px-2 py-1.5 text-xs text-apple-secondary cursor-pointer hover:bg-slate-100 rounded"
                onClick={() => { onSelect(''); setIsOpen(false) }}
              >
                -- 未配置 --
              </div>
            )}
            {filteredProviders.length === 0 ? (
              <div className="p-3 text-center text-xs text-apple-secondary">
                没有找到匹配的模型
              </div>
            ) : (
              filteredProviders.map(p => (
                <div key={p.id} className="mb-2">
                  <div className="px-2 py-1 text-[10px] font-bold text-apple-secondary uppercase bg-slate-50 mb-1 rounded-sm">
                    {p.name}
                  </div>
                  {p.models.map(m => {
                    const val = `${p.id}/${m.id}`
                    const isSelected = val === modelValue
                    return (
                      <div
                        key={m.id}
                        onClick={() => { onSelect(val); setIsOpen(false) }}
                        className={`px-3 py-1.5 text-xs cursor-pointer rounded transition-colors ${
                          isSelected 
                            ? 'bg-apple-accent text-white font-semibold' 
                            : 'hover:bg-blue-50 text-apple-text'
                        }`}
                      >
                        {m.name}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
            {!isModelInProviders && modelValue && !query && (
              <div 
                className="px-2 py-1.5 text-xs text-red-500 cursor-pointer bg-red-50 rounded mt-1"
                onClick={() => setIsOpen(false)}
              >
                {modelValue} (未找到)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  // ── States ────────────────────────────────────────────────────────

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  
  const [savedConfig, setSavedConfig] = useState<FullConfig | null>(null)
  const [draftConfig, setDraftConfig] = useState<FullConfig | null>(null)
  
  const [activeTab, setActiveTab] = useState<'presets' | 'agents' | 'companion' | 'about'>('presets')
  
  // Tab-specific selection states
  const [selectedPresetName, setSelectedPresetName] = useState<string>('')
  const [selectedCustomAgentName, setSelectedCustomAgentName] = useState<string>('')
  
  // Modals & Temp inputs
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [showNewPresetModal, setShowNewPresetModal] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [newPresetTemplate, setNewPresetTemplate] = useState('empty')
  
  const [showNewAgentModal, setShowNewAgentModal] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')

  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncDiff, setSyncDiff] = useState<any>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])

  const [isShutDown, setIsShutDown] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Toast timer ref
  const toastTimeoutRef = useRef<any>(null)

  // ── Toast Utility ──────────────────────────────────────────────────

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    setToast({ message, type })
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null)
    }, 4000)
  }

  // ── API Fetchers ───────────────────────────────────────────────────

  const loadAllData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      // 1. Check Status
      const statusRes = await fetch('/api/status')
      if (!statusRes.ok) throw new Error('无法连接至后端服务')
      const statusData = await statusRes.json()
      if (!statusData.ok) throw new Error(statusData.error || '获取服务器状态失败')
      setStatus(statusData.data)

      // 2. Fetch Providers
      const provRes = await fetch('/api/providers')
      const provData = await provRes.json()
      if (provData.ok) {
        setProviders(provData.data.providers || [])
      }

      // 3. Fetch Config
      const configRes = await fetch('/api/config')
      const configData = await configRes.json()
      if (!configData.ok) throw new Error(configData.error || '获取配置文件失败')
      
      const cfg: FullConfig = configData.data
      // Ensure structures are initialized
      if (!cfg.presets) cfg.presets = {}
      if (!cfg.agents) cfg.agents = {}
      if (!cfg.companion) {
        cfg.companion = {
          enabled: false,
          position: 'bottom-right',
          size: 'medium',
          loopStyle: 'classic',
          speed: 1,
          debug: false,
          gifPack: 'default'
        }
      }

      setSavedConfig(cfg)
      setDraftConfig(JSON.parse(JSON.stringify(cfg)))
      
      // Auto select first preset or active preset
      if (cfg.preset && cfg.presets[cfg.preset]) {
        setSelectedPresetName(cfg.preset)
      } else {
        const keys = Object.keys(cfg.presets)
        if (keys.length > 0) {
          setSelectedPresetName(keys[0])
        }
      }

      // Auto select first custom agent if available
      const agentKeys = Object.keys(cfg.agents)
      if (agentKeys.length > 0) {
        setSelectedCustomAgentName(agentKeys[0])
      }

    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || '加载配置时出错，请确保后端服务已启动。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAllData()
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  // Check if draft has unsaved changes
  const isDirty = draftConfig && savedConfig && JSON.stringify(draftConfig) !== JSON.stringify(savedConfig)

  // ── Change Handlers ────────────────────────────────────────────────

  const handleReset = () => {
    if (savedConfig) {
      setDraftConfig(JSON.parse(JSON.stringify(savedConfig)))
      showToast('已撤销所有未保存的修改', 'info')
    }
  }

  const handleValidate = async () => {
    if (!draftConfig) return
    setIsValidating(true)
    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftConfig)
      })
      const data = await res.json()
      if (data.ok && data.data?.valid) {
        showToast('配置校验成功！无语法或数值范围错误。', 'success')
      } else {
        showToast(data.error || '校验失败，请检查配置数值。', 'error')
      }
    } catch (err) {
      showToast('请求校验失败，网络异常', 'error')
    } finally {
      setIsValidating(false)
    }
  }

  const handleSave = async () => {
    if (!draftConfig) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftConfig)
      })
      const data = await res.json()
      if (data.ok) {
        showToast('配置保存成功！', 'success')
        // Update saved config state
        setSavedConfig(JSON.parse(JSON.stringify(draftConfig)))
      } else {
        showToast(data.error || '保存失败', 'error')
      }
    } catch (err) {
      showToast('保存失败，网络异常', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleShutdown = async () => {
    if (window.confirm('确定要关闭 Slim Config 后端服务吗？关闭后本网页将无法继续操作。')) {
      try {
        const res = await fetch('/api/shutdown', { method: 'POST' })
        const data = await res.json()
        if (data.ok) {
          setIsShutDown(true)
          showToast('服务器正在关闭，可安全关闭此标签页。', 'info')
        }
      } catch (err) {
        // Since server shuts down immediately, fetch may fail or get cancelled, which is expected
        setIsShutDown(true)
      }
    }
  }

  // ── Preset Actions ─────────────────────────────────────────────────

  const handleSwitchActivePreset = async (name: string) => {
    if (isDirty) {
      if (!window.confirm('您有未保存的修改，切换激活预设将丢失这些未保存的更改，是否继续？')) {
        return
      }
    }

    try {
      const res = await fetch('/api/active-preset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: name })
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`已激活预设 「${name}」`, 'success')
        // Reload all data to ensure sync
        await loadAllData()
        setSelectedPresetName(name)
      } else {
        showToast(data.error || '激活失败', 'error')
      }
    } catch (err) {
      showToast('激活请求失败，网络异常', 'error')
    }
  }

  const handleCreatePreset = async () => {
    const name = newPresetName.trim()
    if (!name) {
      showToast('预设名称不能为空', 'error')
      return
    }
    if (draftConfig?.presets[name]) {
      showToast('已存在同名预设', 'error')
      return
    }

    let initialAgents: Record<string, AgentConfig> = {}
    if (newPresetTemplate === 'empty') {
      BUILTIN_AGENTS.forEach(agent => {
        initialAgents[agent.key] = {
          model: '',
          variant: 'medium',
          temperature: 0.5,
          skills: [],
          mcps: []
        }
      })
    } else {
      // Copy from template
      const source = draftConfig?.presets[newPresetTemplate]
      if (source) {
        initialAgents = JSON.parse(JSON.stringify(source))
      }
    }

    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agents: initialAgents })
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`预设 「${name}」 创建成功`, 'success')
        setShowNewPresetModal(false)
        setNewPresetName('')
        setNewPresetTemplate('empty')
        
        // Update local draft immediately
        if (draftConfig) {
          const updatedDraft = { ...draftConfig }
          updatedDraft.presets[name] = initialAgents
          setDraftConfig(updatedDraft)
          if (savedConfig) {
            const updatedSaved = { ...savedConfig }
            updatedSaved.presets[name] = JSON.parse(JSON.stringify(initialAgents))
            setSavedConfig(updatedSaved)
          }
        }
        setSelectedPresetName(name)
      } else {
        showToast(data.error || '创建失败', 'error')
      }
    } catch (err) {
      showToast('网络请求失败', 'error')
    }
  }

  const handleDeletePreset = async (name: string) => {
    if (draftConfig?.preset === name) {
      showToast('无法删除当前激活的预设，请先激活其他预设', 'error')
      return
    }

    if (!window.confirm(`确定要删除预设 「${name}」 吗？此操作不可撤销。`)) {
      return
    }

    try {
      const res = await fetch(`/api/presets/${name}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.ok) {
        showToast(`预设 「${name}」 已删除`, 'success')
        
        // Update states
        if (draftConfig) {
          const updatedDraft = { ...draftConfig }
          delete updatedDraft.presets[name]
          setDraftConfig(updatedDraft)
          
          if (savedConfig) {
            const updatedSaved = { ...savedConfig }
            delete updatedSaved.presets[name]
            setSavedConfig(updatedSaved)
          }

          // Select another preset
          const remain = Object.keys(updatedDraft.presets)
          if (remain.length > 0) {
            setSelectedPresetName(remain[0])
          } else {
            setSelectedPresetName('')
          }
        }
      } else {
        showToast(data.error || '删除失败', 'error')
      }
    } catch (err) {
      showToast('删除请求失败，网络异常', 'error')
    }
  }

  // Helper to update specific agent property in draft config
  const updateAgentInPreset = (presetName: string, agentKey: string, field: keyof AgentConfig, value: any) => {
    if (!draftConfig) return
    const updated = { ...draftConfig }
    if (!updated.presets[presetName]) updated.presets[presetName] = {}
    if (!updated.presets[presetName][agentKey]) {
      updated.presets[presetName][agentKey] = {
        model: '',
        variant: 'medium',
        temperature: 0.5,
        skills: [],
        mcps: []
      }
    }
    updated.presets[presetName][agentKey] = {
      ...updated.presets[presetName][agentKey],
      [field]: value
    }
    setDraftConfig(updated)
  }

  // ── Custom Agent Actions ───────────────────────────────────────────

  const handleCreateCustomAgent = () => {
    const name = newAgentName.trim()
    if (!name) {
      showToast('Agent 名称不能为空', 'error')
      return
    }
    // Check alpha numeric / hyphen / underscore
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
      showToast('Agent 名称只能包含字母、数字、连字符和下划线', 'error')
      return
    }
    if (draftConfig?.agents[name]) {
      showToast('自定义 Agent 已存在', 'error')
      return
    }

    const newAgent: CustomAgent = {
      model: '',
      variant: 'medium',
      temperature: 0.5,
      prompt: '你是一个专业的助手。',
      orchestratorPrompt: `当需要协助处理${name}相关的任务时，请调用此 Agent。`,
      skills: [],
      mcps: []
    }

    if (draftConfig) {
      const updated = { ...draftConfig }
      updated.agents[name] = newAgent
      setDraftConfig(updated)
      
      // Let's do a save to backend or keep in draft.
      // Saving to draft is fine, but to make sure it's created we can save the config.
      // The user will save it globally, or we can write to /api/agents/{name} immediately.
      // Let's call /api/agents/{name} immediately to match backend api expectations:
      fetch(`/api/agents/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAgent)
      }).then(res => res.json()).then(data => {
        if (data.ok) {
          showToast(`自定义 Agent 「${name}」 已创建`, 'success')
          if (savedConfig) {
            const updatedSaved = { ...savedConfig }
            updatedSaved.agents[name] = JSON.parse(JSON.stringify(newAgent))
            setSavedConfig(updatedSaved)
          }
          setSelectedCustomAgentName(name)
          setShowNewAgentModal(false)
          setNewAgentName('')
        } else {
          showToast(data.error || '创建失败', 'error')
        }
      }).catch(() => {
        showToast('网络请求异常', 'error')
      })
    }
  }

  const handleDeleteCustomAgent = (name: string) => {
    if (!window.confirm(`确定要删除自定义 Agent 「${name}」 吗？`)) {
      return
    }

    fetch(`/api/agents/${name}`, {
      method: 'DELETE'
    }).then(res => res.json()).then(data => {
      if (data.ok) {
        showToast(`自定义 Agent 「${name}」 已删除`, 'success')
        if (draftConfig) {
          const updatedDraft = { ...draftConfig }
          delete updatedDraft.agents[name]
          setDraftConfig(updatedDraft)
          
          if (savedConfig) {
            const updatedSaved = { ...savedConfig }
            delete updatedSaved.agents[name]
            setSavedConfig(updatedSaved)
          }

          const remain = Object.keys(updatedDraft.agents)
          if (remain.length > 0) {
            setSelectedCustomAgentName(remain[0])
          } else {
            setSelectedCustomAgentName('')
          }
        }
      } else {
        showToast(data.error || '删除失败', 'error')
      }
    }).catch(() => {
      showToast('网络请求异常', 'error')
    })
  }

  const updateCustomAgentField = (name: string, field: keyof CustomAgent, value: any) => {
    if (!draftConfig) return
    const updated = { ...draftConfig }
    if (!updated.agents[name]) return
    updated.agents[name] = {
      ...updated.agents[name],
      [field]: value
    }
    setDraftConfig(updated)
  }

  // ── Companion Actions ──────────────────────────────────────────────

  const updateCompanionField = (field: keyof CompanionConfig, value: any) => {
    if (!draftConfig) return
    const updated = { ...draftConfig }
    updated.companion = {
      ...updated.companion,
      [field]: value
    }
    setDraftConfig(updated)
  }

  // ── Sync Actions ───────────────────────────────────────────────────

  const handleOpenSync = async () => {
    setShowSyncModal(true)
    setSyncLoading(true)
    setSyncDiff(null)
    try {
      const res = await fetch('/api/providers/sync/diff')
      const data = await res.json()
      if (data.ok) {
        setSyncDiff(data.data)
        setSelectedToAdd((data.data.to_add || []).map((m: any) => m.id))
      } else {
        showToast(data.error || '获取差异失败', 'error')
        setShowSyncModal(false)
      }
    } catch (err) {
      showToast('网络请求失败', 'error')
      setShowSyncModal(false)
    } finally {
      setSyncLoading(false)
    }
  }

  const handleApplySync = async () => {
    if (!syncDiff) return
    setSyncLoading(true)
    try {
      const toAdd = syncDiff.to_add?.filter((m: any) => selectedToAdd.includes(m.id)) || []
      const toRemove = syncDiff.to_remove || []
      
      let added = false
      if (toAdd.length > 0) {
        const res = await fetch('/api/providers/sync/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_add: toAdd })
        })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || '添加模型失败')
        added = true
      }
      
      if (toRemove.length > 0) {
        try {
          await fetch('/api/providers/sync/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to_remove: toRemove })
          })
        } catch (e) {
          // ignore if not implemented on backend yet
        }
      }
      
      showToast(added ? '同步成功' : '没有需要添加的模型', 'success')
      setShowSyncModal(false)
      await loadAllData()
    } catch (err: any) {
      showToast(err.message || '同步请求失败', 'error')
    } finally {
      setSyncLoading(false)
    }
  }

  // ── Render Helpers ─────────────────────────────────────────────────

  const renderModelSelector = (modelValue: string, onSelect: (val: string) => void) => {
    return (
      <SearchableModelSelect 
        modelValue={modelValue}
        onSelect={onSelect}
        providers={providers}
      />
    )
  }

  const renderAgentForm = (agent: AgentConfig, updateField: (field: keyof AgentConfig, val: any) => void) => {
    return (
      <div className="space-y-4">
        {/* Model */}
        <div>
          <label className="block text-xs font-semibold text-apple-secondary mb-1.5 uppercase tracking-wider">
            分配模型 (Model)
          </label>
          {renderModelSelector(agent.model, (val) => updateField('model', val))}
        </div>

        {/* Variant */}
        <div>
          <label className="block text-xs font-semibold text-apple-secondary mb-1.5 uppercase tracking-wider">
            运行变体 (Variant)
          </label>
          <div className="flex bg-slate-100 p-0.5 rounded-btn border border-apple-border">
            {(['high', 'medium', 'low'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => updateField('variant', v)}
                className={`flex-1 text-center py-1 text-xs font-medium rounded-[8px] transition-all ${
                  agent.variant === v
                    ? 'bg-white text-apple-text shadow-sm'
                    : 'text-apple-secondary hover:text-apple-text'
                }`}
              >
                {v === 'high' ? 'High' : v === 'medium' ? 'Medium' : 'Low'}
              </button>
            ))}
          </div>
        </div>

        {/* Temperature */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-semibold text-apple-secondary uppercase tracking-wider">
              温度参数 (Temperature)
            </label>
            <span className="text-xs font-mono font-semibold text-apple-accent bg-blue-50 px-1.5 py-0.5 rounded">
              {agent.temperature !== undefined ? agent.temperature.toFixed(1) : '0.5'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.1"
              value={agent.temperature ?? 0.5}
              onChange={(e) => updateField('temperature', parseFloat(e.target.value))}
              className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-apple-accent"
            />
            <input
              type="number"
              min="0.0"
              max="2.0"
              step="0.1"
              value={agent.temperature ?? 0.5}
              onChange={(e) => {
                let v = parseFloat(e.target.value)
                if (isNaN(v)) v = 0.5
                v = Math.max(0, Math.min(2, v))
                updateField('temperature', v)
              }}
              className="w-12 text-center text-xs border border-apple-border rounded-btn p-1 focus:outline-none"
            />
          </div>
        </div>

        {/* Skills */}
        <div>
          <label className="block text-xs font-semibold text-apple-secondary mb-1.5 uppercase tracking-wider">
            支持的 Skills
          </label>
          <TagInput
            tags={agent.skills || []}
            onChange={(tags) => updateField('skills', tags)}
            suggestions={DEFAULT_SKILLS}
            placeholder="按 Enter 或逗号添加 Skill"
          />
        </div>

        {/* MCPs */}
        <div>
          <label className="block text-xs font-semibold text-apple-secondary mb-1.5 uppercase tracking-wider">
            关联 MCP 工具
          </label>
          <TagInput
            tags={agent.mcps || []}
            onChange={(tags) => updateField('mcps', tags)}
            suggestions={DEFAULT_MCPS}
            placeholder="按 Enter 或逗号添加 MCP"
          />
        </div>
      </div>
    )
  }

  // ── Render Main content based on shutdown state ────────────────────

  if (isShutDown) {
    return (
      <div className="min-h-screen bg-apple-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-modal shadow-apple-lg max-w-md w-full p-8 text-center border border-apple-border space-y-6">
          <div className="w-16 h-16 bg-blue-50 text-apple-accent rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 size={36} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-apple-text">已安全退出服务</h2>
            <p className="text-sm text-apple-secondary leading-relaxed">
              后端 Python FastAPI 进程已成功停止。您可以安全关闭当前浏览器标签页。
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => window.close()}
              className="w-full bg-apple-accent text-white rounded-btn py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              关闭此页面
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Connection/Loading Error Screen
  if (errorMsg) {
    return (
      <div className="min-h-screen bg-apple-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-modal shadow-apple-lg max-w-md w-full p-8 text-center border border-apple-border space-y-6">
          <div className="w-16 h-16 bg-red-50 text-apple-danger rounded-full flex items-center justify-center mx-auto shadow-inner">
            <AlertTriangle size={36} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-apple-text">无法读取配置数据</h2>
            <p className="text-sm text-apple-danger bg-red-50/50 p-3 rounded-btn border border-red-100 font-mono text-left break-all text-xs">
              {errorMsg}
            </p>
            <p className="text-xs text-apple-secondary pt-2">
              请检查后端进程是否已启动在 <code className="bg-slate-100 px-1 py-0.5 rounded">http://127.0.0.1:8080</code>。
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadAllData}
              className="flex-1 bg-apple-accent text-white rounded-btn py-2 text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              重试连接
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading || !draftConfig) {
    return (
      <div className="min-h-screen bg-apple-bg flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-apple-accent"></div>
        <p className="text-xs text-apple-secondary font-medium font-apple tracking-wider">正在拉取 Slim Config 配置文件...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-apple selection:bg-blue-100 relative z-0">
      <div className="animated-bg"><div className="animated-blob-3"></div></div>
      
      {/* ── Frosted Header ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/60 backdrop-blur-glass border-b border-white/50 shadow-glass flex items-center justify-between px-6 py-4 transition-all">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-2.5 rounded-btn shadow-lg transform transition hover:scale-105">
            <Settings size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-apple-text tracking-tight m-0">Slim Config</h1>
            <p className="text-[11px] text-apple-secondary m-0">oh-my-opencode-slim 插件配置控制台</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            后端服务正常运行中
          </span>
          <button
            onClick={handleShutdown}
            className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-btn px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            <LogOut size={13} />
            退出程序
          </button>
        </div>
      </header>

      {/* ── Layout Workspace ─────────────────────────────────────────── */}
      <div className="flex-1 flex max-w-[1400px] w-full mx-auto p-6 gap-6 items-start animate-fade-in relative z-10">
        
        {/* Left Sidebar Nav */}
        <aside className="w-[240px] flex-shrink-0 bg-white/80 backdrop-blur-glass rounded-card border border-white/50 shadow-glass p-4.5 space-y-6 transition-all">
          <div className="space-y-2">
            <button
              onClick={() => setActiveTab('presets')}
              className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-btn text-xs font-semibold transition-all duration-300 ${
                activeTab === 'presets'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md transform scale-[1.02]'
                  : 'text-apple-text hover:bg-white hover:shadow-sm hover:-translate-y-0.5'
              }`}
            >
              <Sliders size={16} />
              Presets 预设配置
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-btn text-xs font-semibold transition-all duration-300 ${
                activeTab === 'agents'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md transform scale-[1.02]'
                  : 'text-apple-text hover:bg-white hover:shadow-sm hover:-translate-y-0.5'
              }`}
            >
              <User size={16} />
              Agents 自定义 Agent
            </button>
            <button
              onClick={() => setActiveTab('companion')}
              className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-btn text-xs font-semibold transition-all duration-300 ${
                activeTab === 'companion'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md transform scale-[1.02]'
                  : 'text-apple-text hover:bg-white hover:shadow-sm hover:-translate-y-0.5'
              }`}
            >
              <Sparkles size={16} />
              Companion 伙伴动画
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-btn text-xs font-semibold transition-all duration-300 ${
                activeTab === 'about'
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md transform scale-[1.02]'
                  : 'text-apple-text hover:bg-white hover:shadow-sm hover:-translate-y-0.5'
              }`}
            >
              <Info size={16} />
              关于 Slim Config
            </button>
          </div>

          <div className="border-t border-apple-border pt-4 space-y-3.5">
            <div>
              <span className="block text-[10px] font-bold text-apple-secondary uppercase tracking-wider mb-1">
                当前激活预设
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded bg-blue-50 border border-blue-100 text-xs font-bold text-apple-accent">
                {savedConfig?.preset || '未指定'}
              </span>
            </div>

            <div>
              <span className="block text-[10px] font-bold text-apple-secondary uppercase tracking-wider mb-1">
                目标配置文件 (JSON)
              </span>
              <span 
                className="block text-[10px] font-mono text-apple-secondary break-all bg-slate-50 p-1.5 rounded border border-apple-border cursor-help"
                title={status?.slim_config_path}
              >
                .../{status?.slim_config_path?.split(/[\\/]/).pop()}
              </span>
            </div>
            
            <div>
              <span className="block text-[10px] font-bold text-apple-secondary uppercase tracking-wider mb-1">
                后端版本
              </span>
              <span className="text-xs text-apple-text font-semibold">
                v{status?.version || '1.0.0'}
              </span>
            </div>
            
            <button
              onClick={handleOpenSync}
              className="w-full flex items-center justify-center gap-2 mt-4 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-apple-text text-xs font-bold rounded-btn transition-colors border border-apple-border shadow-sm"
            >
              <RotateCcw size={14} />
              从 New-API 同步
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          
          {/* TAB 1: PRESETS */}
          {activeTab === 'presets' && (
            <div className="flex gap-6 items-start">
              
              {/* Presets List Column (Left) */}
              <div className="w-[250px] flex-shrink-0 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-apple-secondary uppercase tracking-wider">
                    预设列表
                  </h3>
                  <button
                    onClick={() => setShowNewPresetModal(true)}
                    className="p-1 text-apple-accent hover:bg-blue-50 rounded transition-colors"
                    title="新建预设"
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="space-y-2">
                  {Object.keys(draftConfig.presets || {}).map((pName) => {
                    const isActive = draftConfig.preset === pName
                    const isSelected = selectedPresetName === pName
                    return (
                      <div
                        key={pName}
                        onClick={() => setSelectedPresetName(pName)}
                        className={`group relative p-3.5 rounded-card border cursor-pointer transition-all duration-300 ${
                          isSelected
                            ? 'bg-white/90 backdrop-blur-glass border-blue-400 shadow-apple-md ring-2 ring-blue-400/30 transform scale-[1.02]'
                            : 'bg-white/60 backdrop-blur-glass border-white/50 hover:bg-white/80 hover:shadow-apple-md hover:-translate-y-0.5'
                        }`}
                      >
                        <div className="space-y-2.5">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-apple-text break-all pr-4">
                              {pName}
                            </span>
                            {isActive && (
                              <span className="flex-shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                激活中
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50">
                            {!isActive ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSwitchActivePreset(pName)
                                }}
                                className="text-[10px] text-apple-accent hover:underline font-semibold"
                              >
                                设为激活
                              </button>
                            ) : (
                              <span className="text-[10px] text-apple-secondary italic">系统使用中</span>
                            )}

                            {Object.keys(draftConfig.presets).length > 1 && !isActive && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeletePreset(pName)
                                }}
                                className="opacity-0 group-hover:opacity-100 text-[10px] text-apple-danger hover:underline font-semibold transition-opacity"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {Object.keys(draftConfig.presets || {}).length === 0 && (
                    <div className="text-center py-6 bg-white border border-dashed border-apple-border rounded-card">
                      <p className="text-xs text-apple-secondary">无可用预设</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Preset Detail Grid (Right) */}
              <div className="flex-1 space-y-6">
                {selectedPresetName && draftConfig.presets[selectedPresetName] ? (
                  <>
                    <div className="flex justify-between items-center bg-white/70 backdrop-blur-glass p-4.5 rounded-card border border-white/50 shadow-glass transition-all hover:shadow-apple-md">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-apple-text">
                            正在编辑: <span className="text-apple-accent">{selectedPresetName}</span>
                          </h2>
                          {draftConfig.preset === selectedPresetName && (
                            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-medium">
                              当前激活的预设
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-apple-secondary mt-1">
                          在此配置该预设下全部 8 个内置 Agent 的模型及参数。
                        </p>
                      </div>
                      {draftConfig.preset !== selectedPresetName && (
                        <button
                          onClick={() => handleSwitchActivePreset(selectedPresetName)}
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md hover:shadow-lg rounded-btn px-4 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:from-blue-600 hover:to-indigo-700"
                        >
                          激活此 Preset
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {BUILTIN_AGENTS.map((agent) => {
                        const agentConfig = draftConfig.presets[selectedPresetName][agent.key] || {
                          model: '',
                          variant: 'medium',
                          temperature: 0.5,
                          skills: [],
                          mcps: []
                        }

                        return (
                          <div
                            key={agent.key}
                            className="bg-white/70 backdrop-blur-glass rounded-card border border-white/50 shadow-glass p-4.5 space-y-4 hover:shadow-apple-lg hover:-translate-y-1 transition-all duration-300 group"
                          >
                            <div className="flex justify-between items-start pb-2 border-b border-apple-border">
                              <div>
                                <h4 className="text-xs font-bold text-apple-text">
                                  {agent.name}
                                </h4>
                                <p className="text-[10px] text-apple-secondary font-mono">
                                  {agent.key}
                                </p>
                              </div>
                              <span className="text-[10px] text-apple-secondary bg-slate-100 px-1.5 py-0.5 rounded max-w-[120px] truncate" title={agent.desc}>
                                {agent.desc}
                              </span>
                            </div>

                            {renderAgentForm(agentConfig, (field, val) => {
                              updateAgentInPreset(selectedPresetName, agent.key, field, val)
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-16 bg-white rounded-card border border-apple-border shadow-apple-sm space-y-3">
                    <Sliders size={40} className="text-apple-secondary mx-auto" />
                    <p className="text-sm font-semibold text-apple-text">未选择任何 Preset</p>
                    <p className="text-xs text-apple-secondary">请在左侧列表中点击选择一个 Preset 进行编辑。</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOM AGENTS */}
          {activeTab === 'agents' && (
            <div className="flex gap-6 items-start">
              
              {/* Custom Agent List (Left) */}
              <div className="w-[250px] flex-shrink-0 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-apple-secondary uppercase tracking-wider">
                    自定义 Agents
                  </h3>
                  <button
                    onClick={() => setShowNewAgentModal(true)}
                    className="p-1 text-apple-accent hover:bg-blue-50 rounded transition-colors"
                    title="添加自定义 Agent"
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                </div>

                <div className="space-y-2">
                  {Object.keys(draftConfig.agents || {}).map((aName) => {
                    const isSelected = selectedCustomAgentName === aName
                    const agentObj = draftConfig.agents[aName]
                    return (
                      <div
                        key={aName}
                        onClick={() => setSelectedCustomAgentName(aName)}
                        className={`p-3.5 rounded-card border cursor-pointer transition-all duration-300 ${
                          isSelected
                            ? 'bg-white/90 backdrop-blur-glass border-blue-400 shadow-apple-md ring-2 ring-blue-400/30 transform scale-[1.02]'
                            : 'bg-white/60 backdrop-blur-glass border-white/50 hover:bg-white/80 hover:shadow-apple-md hover:-translate-y-0.5'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-bold text-apple-text block truncate w-[160px]">
                              {aName}
                            </span>
                            <span className="text-[10px] text-apple-secondary block mt-0.5 truncate w-[160px]">
                              {agentObj.model || '未分配模型'}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteCustomAgent(aName)
                            }}
                            className="p-1 text-apple-secondary hover:text-apple-danger rounded hover:bg-slate-100"
                            title="删除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {Object.keys(draftConfig.agents || {}).length === 0 && (
                    <div className="text-center py-8 bg-white border border-dashed border-apple-border rounded-card space-y-2">
                      <p className="text-xs text-apple-secondary">暂无自定义 Agent</p>
                      <button
                        onClick={() => setShowNewAgentModal(true)}
                        className="text-xs text-apple-accent hover:underline font-bold"
                      >
                        + 新增自定义 Agent
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Agent Edit Panel (Right) */}
              <div className="flex-1">
                {selectedCustomAgentName && draftConfig.agents[selectedCustomAgentName] ? (
                  <div className="bg-white/70 backdrop-blur-glass rounded-card border border-white/50 shadow-glass p-6 space-y-6">
                    <div className="flex justify-between items-start pb-4 border-b border-apple-border">
                      <div>
                        <h2 className="text-base font-bold text-apple-text">
                          编辑 Agent: <span className="text-apple-accent">@{selectedCustomAgentName}</span>
                        </h2>
                        <p className="text-xs text-apple-secondary mt-1">
                          在这里配置您的自定义 Agent 的调度机制、系统提示词和通用参数。
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteCustomAgent(selectedCustomAgentName)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs text-apple-danger bg-red-50 hover:bg-red-100 rounded-btn transition-colors border border-red-100 font-semibold"
                      >
                        <Trash2 size={13} />
                        删除此 Agent
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Left: General Settings (same as built-in) */}
                      <div className="space-y-4 bg-slate-50/50 p-4.5 rounded-card border border-apple-border">
                        <h3 className="text-xs font-bold text-apple-text uppercase tracking-wider mb-2">
                          模型与通用配置
                        </h3>
                        {renderAgentForm(
                          draftConfig.agents[selectedCustomAgentName],
                          (field, val) => updateCustomAgentField(selectedCustomAgentName, field, val)
                        )}
                      </div>

                      {/* Right: Prompts */}
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-apple-text uppercase tracking-wider mb-2">
                          提示词设定
                        </h3>
                        
                        {/* Prompt */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-apple-secondary uppercase tracking-wider">
                              系统提示词 (Prompt)
                            </label>
                            <span className="text-[10px] text-apple-secondary">决定 Agent 的角色扮演和指令准则</span>
                          </div>
                          <textarea
                            rows={6}
                            value={draftConfig.agents[selectedCustomAgentName].prompt || ''}
                            onChange={(e) => updateCustomAgentField(selectedCustomAgentName, 'prompt', e.target.value)}
                            placeholder="你是一个审查 API 设计的助手..."
                            className="w-full text-xs font-mono border border-apple-border rounded-btn p-3 text-apple-text shadow-inner focus:outline-none focus:ring-1 focus:ring-apple-accent hover:border-slate-300"
                          />
                        </div>

                        {/* Orchestrator Prompt */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-apple-secondary uppercase tracking-wider">
                              主控器触发词 (Orchestrator Prompt)
                            </label>
                            <span className="text-[10px] text-apple-secondary">告诉主控器 (Orchestrator) 什么时候应该调用此 Agent</span>
                          </div>
                          <textarea
                            rows={4}
                            value={draftConfig.agents[selectedCustomAgentName].orchestratorPrompt || ''}
                            onChange={(e) => updateCustomAgentField(selectedCustomAgentName, 'orchestratorPrompt', e.target.value)}
                            placeholder="Delegate to @api-reviewer for API contract changes..."
                            className="w-full text-xs font-mono border border-apple-border rounded-btn p-3 text-apple-text shadow-inner focus:outline-none focus:ring-1 focus:ring-apple-accent hover:border-slate-300"
                          />
                        </div>

                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 bg-white rounded-card border border-apple-border shadow-apple-sm space-y-3">
                    <User size={40} className="text-apple-secondary mx-auto" />
                    <p className="text-sm font-semibold text-apple-text">未选择自定义 Agent</p>
                    <p className="text-xs text-apple-secondary">在左侧选择一个 Agent 或点击新建按钮来创建一个自定义 Agent 角色。</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COMPANION */}
          {activeTab === 'companion' && (
            <div className="bg-white/70 backdrop-blur-glass rounded-card border border-white/50 shadow-glass p-6 max-w-3xl mx-auto space-y-6 transition-all hover:shadow-apple-md">
              <div className="pb-4 border-b border-apple-border">
                <h2 className="text-base font-bold text-apple-text">Companion 伙伴动画配置</h2>
                <p className="text-xs text-apple-secondary mt-1">
                  控制 IDE 界面中伴侣助手的行为和显示样式。
                </p>
              </div>

              <div className="space-y-6">
                
                {/* Enabled Switch */}
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-apple-border rounded-card">
                  <div>
                    <span className="block text-xs font-bold text-apple-text">启用 Companion 角色</span>
                    <span className="text-[10px] text-apple-secondary mt-0.5">在界面角落以 GIF 形象显示小助手动画</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateCompanionField('enabled', !draftConfig.companion.enabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      draftConfig.companion.enabled ? 'bg-apple-accent' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        draftConfig.companion.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Sub configuration options, only show if enabled */}
                <div className={`space-y-6 transition-all duration-300 ${draftConfig.companion.enabled ? 'opacity-100 pointer-events-auto' : 'opacity-50 pointer-events-none'}`}>
                  
                  {/* Position selector: 2x2 grid representing screen corners */}
                  <div>
                    <label className="block text-xs font-semibold text-apple-secondary uppercase tracking-wider mb-2">
                      动画停靠位置 (Position)
                    </label>
                    <div className="grid grid-cols-2 gap-3 max-w-[320px] mx-auto p-4 bg-slate-50 border border-apple-border rounded-card">
                      {([
                        { key: 'top-left', name: '左上角 (Top-Left)' },
                        { key: 'top-right', name: '右上角 (Top-Right)' },
                        { key: 'bottom-left', name: '左下角 (Bottom-Left)' },
                        { key: 'bottom-right', name: '右下角 (Bottom-Right)' }
                      ] as const).map((pos) => {
                        const isSelected = draftConfig.companion.position === pos.key
                        return (
                          <button
                            key={pos.key}
                            type="button"
                            onClick={() => updateCompanionField('position', pos.key)}
                            className={`p-3 rounded-btn border text-xs font-semibold text-center transition-all ${
                              isSelected
                                ? 'bg-white border-apple-accent text-apple-accent shadow-sm'
                                : 'bg-white hover:bg-slate-100 text-apple-secondary border-apple-border'
                            }`}
                          >
                            {pos.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Size group */}
                  <div>
                    <label className="block text-xs font-semibold text-apple-secondary uppercase tracking-wider mb-2">
                      尺寸 (Size)
                    </label>
                    <div className="flex bg-slate-100 p-0.5 rounded-btn border border-apple-border max-w-[360px]">
                      {(['small', 'medium', 'large'] as const).map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => updateCompanionField('size', sz)}
                          className={`flex-1 text-center py-1.5 text-xs font-medium rounded-[8px] transition-all ${
                            draftConfig.companion.size === sz
                              ? 'bg-white text-apple-text shadow-sm'
                              : 'text-apple-secondary hover:text-apple-text'
                          }`}
                        >
                          {sz === 'small' ? '小 (Small)' : sz === 'medium' ? '中 (Medium)' : '大 (Large)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Loop Style */}
                  <div>
                    <label className="block text-xs font-semibold text-apple-secondary uppercase tracking-wider mb-2">
                      循环模式 (Loop Style)
                    </label>
                    <div className="flex bg-slate-100 p-0.5 rounded-btn border border-apple-border max-w-[300px]">
                      {(['classic', 'smooth'] as const).map((ls) => (
                        <button
                          key={ls}
                          type="button"
                          onClick={() => updateCompanionField('loopStyle', ls)}
                          className={`flex-1 text-center py-1.5 text-xs font-medium rounded-[8px] transition-all ${
                            draftConfig.companion.loopStyle === ls
                              ? 'bg-white text-apple-text shadow-sm'
                              : 'text-apple-secondary hover:text-apple-text'
                          }`}
                        >
                          {ls === 'classic' ? '经典循环 (Classic)' : '平滑循环 (Smooth)'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Speed slider */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-apple-secondary uppercase tracking-wider">
                        动画播放速度 (Speed)
                      </label>
                      <span className="text-xs font-mono font-semibold text-apple-accent bg-blue-50 px-1.5 py-0.5 rounded">
                        {draftConfig.companion.speed.toFixed(2)}x
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.25"
                        max="4.0"
                        step="0.25"
                        value={draftConfig.companion.speed || 1}
                        onChange={(e) => updateCompanionField('speed', parseFloat(e.target.value))}
                        className="flex-1 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-apple-accent"
                      />
                      <input
                        type="number"
                        min="0.25"
                        max="4.0"
                        step="0.25"
                        value={draftConfig.companion.speed || 1}
                        onChange={(e) => {
                          let v = parseFloat(e.target.value)
                          if (isNaN(v)) v = 1
                          v = Math.max(0.25, Math.min(4, v))
                          updateCompanionField('speed', v)
                        }}
                        className="w-16 text-center text-xs border border-apple-border rounded-btn p-1 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Debug Checkbox */}
                  <div className="flex items-center justify-between p-3 bg-amber-50/50 border border-amber-100 rounded-btn">
                    <div>
                      <span className="block text-xs font-bold text-amber-800">启用 Debug 调试</span>
                      <span className="text-[10px] text-amber-600 mt-0.5">控制台输出 Companion 日志</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateCompanionField('debug', !draftConfig.companion.debug)}
                      className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        draftConfig.companion.debug ? 'bg-amber-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          draftConfig.companion.debug ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* GIF Pack (read only) */}
                  <div className="flex items-center justify-between py-2 border-t border-apple-border">
                    <span className="text-xs font-semibold text-apple-secondary">GIF 资源包 (GIF Pack)</span>
                    <span className="text-xs font-mono font-bold text-apple-text bg-slate-100 px-2 py-0.5 rounded border border-apple-border">
                      {draftConfig.companion.gifPack || 'default'}
                    </span>
                  </div>

                </div>

              </div>
            </div>
          )}

          {/* TAB 4: ABOUT */}
          {activeTab === 'about' && (
            <div className="bg-white/70 backdrop-blur-glass rounded-card border border-white/50 shadow-glass p-6 max-w-3xl mx-auto space-y-6 transition-all hover:shadow-apple-md">
              <div className="pb-4 border-b border-apple-border">
                <h2 className="text-base font-bold text-apple-text">关于 Slim Config</h2>
                <p className="text-xs text-apple-secondary mt-1">
                  图形化管理 OpenCode 的 oh-my-opencode-slim 插件配置文件的工具。
                </p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-card border border-apple-border space-y-1">
                    <span className="block text-[10px] font-bold text-apple-secondary uppercase">版本信息</span>
                    <span className="block text-sm font-bold text-apple-text">v{status?.version || '1.0.0'}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-card border border-apple-border space-y-1">
                    <span className="block text-[10px] font-bold text-apple-secondary uppercase">后端架构</span>
                    <span className="block text-sm font-bold text-apple-text">Python FastAPI</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-card border border-apple-border space-y-1">
                    <span className="block text-[10px] font-bold text-apple-secondary uppercase">UI 风格</span>
                    <span className="block text-sm font-bold text-apple-text">Apple ADS</span>
                  </div>
                </div>

                <div className="space-y-3.5 bg-slate-50/50 p-4.5 rounded-card border border-apple-border">
                  <h3 className="text-xs font-bold text-apple-text uppercase">相关路径</h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="block font-semibold text-apple-secondary">配置根目录 (Config Dir)</span>
                      <code className="block bg-white p-2 rounded border border-apple-border font-mono text-[11px] select-all break-all mt-1">
                        {status?.config_dir}
                      </code>
                    </div>
                    <div>
                      <span className="block font-semibold text-apple-secondary">用户专属配置文件 (Read/Write)</span>
                      <code className="block bg-white p-2 rounded border border-apple-border font-mono text-[11px] select-all break-all mt-1">
                        {status?.slim_config_path}
                      </code>
                    </div>
                    <div>
                      <span className="block font-semibold text-apple-secondary">OpenCode 基础文件 (Read Only)</span>
                      <code className="block bg-white p-2 rounded border border-apple-border font-mono text-[11px] select-all break-all mt-1">
                        {status?.opencode_config_path}
                      </code>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-card space-y-2 text-xs leading-relaxed text-apple-accent">
                  <h4 className="font-bold flex items-center gap-1.5">
                    <Info size={14} />
                    配置文件的校验与安全性说明
                  </h4>
                  <p>
                    每次点击「保存修改」或「立即校验」时，后端将会对温度 (temperature)、变体 (variant) 以及伴侣的动画速率 (speed)、位置 (position) 等进行严格的值域审查。对于不合法的值将拒绝写入并提供明细报错。
                  </p>
                  <p>
                    如果希望直接编辑 JSON 格式，您也可以使用支持 JSONC 语法格式的 IDE（如 VS Code）直接打开并编辑上述路径中的配置文件。
                  </p>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── Unsaved Changes Bottom Banner ────────────────────────────── */}
      {isDirty && (
        <div className="sticky bottom-0 left-0 right-0 bg-white/80 backdrop-blur-glass border-t border-white/50 shadow-apple-lg px-6 py-4.5 flex items-center justify-between z-30 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-full border border-amber-200">
              <AlertCircle size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-apple-text">检测到未保存的更改</p>
              <p className="text-[11px] text-apple-secondary mt-0.5">
                您修改了预设、自定义 Agent 或 Companion 伙伴动画的参数。这些更改只保存在临时缓冲区中。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              disabled={isSaving || isValidating}
              className="flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-apple-secondary hover:text-apple-text bg-slate-100 hover:bg-slate-200 rounded-btn transition-colors"
            >
              <RotateCcw size={13} />
              撤消修改
            </button>
            <button
              onClick={handleValidate}
              disabled={isSaving || isValidating}
              className="flex items-center gap-1 px-3.5 py-2 text-xs font-semibold text-apple-accent bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-btn transition-colors"
            >
              {isValidating ? '正在校验...' : '校验配置'}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isValidating}
              className="flex items-center gap-1 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-btn transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <Save size={13} />
              {isSaving ? '正在保存...' : '保存更改'}
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Notifications ───────────────────────────────────────── */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 animate-slide-in">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-card border shadow-apple-md ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}>
            {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600" />}
            {toast.type === 'error' && <AlertCircle size={16} className="text-red-600" />}
            {toast.type === 'info' && <Info size={16} className="text-blue-600" />}
            <span className="text-xs font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      {/* ── Modal: Create Preset ──────────────────────────────────────── */}
      {showNewPresetModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white/90 backdrop-blur-glass rounded-modal shadow-apple-lg border border-white/50 max-w-sm w-full p-6 space-y-4 animate-scale-in">
            <div className="flex justify-between items-center pb-2 border-b border-apple-border">
              <h3 className="text-sm font-bold text-apple-text">新建 Preset 预设</h3>
              <button
                onClick={() => {
                  setShowNewPresetModal(false)
                  setNewPresetName('')
                }}
                className="text-apple-secondary hover:text-apple-text"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-apple-secondary mb-1.5 uppercase tracking-wider">
                  预设名称 (ID)
                </label>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="例如: custom-prod-api"
                  className="w-full text-xs border border-apple-border rounded-btn p-2.5 focus:outline-none focus:ring-1 focus:ring-apple-accent hover:border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-apple-secondary mb-1.5 uppercase tracking-wider">
                  基于预设模板拷贝
                </label>
                <select
                  value={newPresetTemplate}
                  onChange={(e) => setNewPresetTemplate(e.target.value)}
                  className="w-full text-xs bg-white border border-apple-border rounded-btn p-2.5 focus:outline-none hover:border-slate-300"
                >
                  <option value="empty">-- 空模板 (完全未配置) --</option>
                  {Object.keys(draftConfig.presets).map(pKey => (
                    <option key={pKey} value={pKey}>拷贝已有: {pKey}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowNewPresetModal(false)
                  setNewPresetName('')
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-apple-secondary rounded-btn py-2 text-xs font-semibold transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreatePreset}
                className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-btn py-2 text-xs font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                创建预设
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Create Custom Agent ────────────────────────────────── */}
      {showNewAgentModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-modal shadow-apple-lg border border-apple-border max-w-sm w-full p-6 space-y-4 animate-scale-in">
            <div className="flex justify-between items-center pb-2 border-b border-apple-border">
              <h3 className="text-sm font-bold text-apple-text">新增自定义 Agent</h3>
              <button
                onClick={() => {
                  setShowNewAgentModal(false)
                  setNewAgentName('')
                }}
                className="text-apple-secondary hover:text-apple-text"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-apple-secondary mb-1.5 uppercase tracking-wider">
                  Agent 唯一键名
                </label>
                <input
                  type="text"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="例如: sql-optimizer"
                  className="w-full text-xs border border-apple-border rounded-btn p-2.5 focus:outline-none focus:ring-1 focus:ring-apple-accent hover:border-slate-300"
                />
                <span className="text-[10px] text-apple-secondary block mt-1">
                  注意：名称只能包含字母、数字、连字符和下划线，用于 omo-slim 的 @ 调用
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowNewAgentModal(false)
                  setNewAgentName('')
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-apple-secondary rounded-btn py-2 text-xs font-semibold transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateCustomAgent}
                className="flex-1 bg-apple-accent text-white rounded-btn py-2 text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Sync New API ──────────────────────────────────────── */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-modal shadow-apple-lg border border-apple-border max-w-lg w-full p-6 space-y-4 animate-scale-in max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-apple-border shrink-0">
              <h3 className="text-sm font-bold text-apple-text">New-API 模型同步</h3>
              <button
                onClick={() => !syncLoading && setShowSyncModal(false)}
                className="text-apple-secondary hover:text-apple-text"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[300px]">
              {syncLoading && !syncDiff ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-apple-accent"></div>
                  <p className="text-xs text-apple-secondary">正在获取远程模型差异...</p>
                </div>
              ) : syncDiff ? (
                <>
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-btn border border-apple-border">
                    <div className="text-center flex-1 border-r border-apple-border">
                      <p className="text-[10px] text-apple-secondary uppercase font-bold">当前配置</p>
                      <p className="text-lg font-bold text-apple-text">{syncDiff.current_count}</p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-[10px] text-apple-secondary uppercase font-bold">远程面板</p>
                      <p className="text-lg font-bold text-apple-accent">{syncDiff.remote_count}</p>
                    </div>
                  </div>

                  {syncDiff.to_add?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-apple-text">── 新增 ({syncDiff.to_add.length}) ──</h4>
                      <div className="border border-apple-border rounded-btn max-h-[200px] overflow-y-auto">
                        {syncDiff.to_add.map((m: any) => (
                          <label key={m.id} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 border-b border-apple-border last:border-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedToAdd.includes(m.id)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedToAdd([...selectedToAdd, m.id])
                                else setSelectedToAdd(selectedToAdd.filter(id => id !== m.id))
                              }}
                              className="w-4 h-4 text-apple-accent rounded border-slate-300 focus:ring-apple-accent"
                            />
                            <div className="truncate">
                              <span className="text-xs font-semibold text-apple-text block truncate">{m.name}</span>
                              <span className="text-[10px] text-apple-secondary block truncate">{m.id}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {syncDiff.to_remove?.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-red-600">── 待移除 ({syncDiff.to_remove.length}) ──</h4>
                      <div className="border border-red-100 bg-red-50 rounded-btn max-h-[150px] overflow-y-auto p-2">
                        {syncDiff.to_remove.map((m: any) => (
                          <div key={m.id} className="flex items-center gap-2 p-1 text-xs text-red-700 font-mono">
                            <Trash2 size={12} className="shrink-0" />
                            <span className="truncate">{m.id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {syncDiff.to_add?.length === 0 && syncDiff.to_remove?.length === 0 && (
                    <div className="text-center py-8">
                      <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-apple-text">配置已是最新</p>
                      <p className="text-xs text-apple-secondary">无需同步</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex gap-3 pt-2 shrink-0 border-t border-apple-border mt-4">
              <button
                onClick={() => !syncLoading && setShowSyncModal(false)}
                disabled={syncLoading}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-apple-secondary rounded-btn py-2 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleApplySync}
                disabled={syncLoading || !syncDiff || (syncDiff.to_add?.length === 0 && syncDiff.to_remove?.length === 0)}
                className="flex-1 bg-apple-accent text-white rounded-btn py-2 text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {syncLoading && syncDiff ? <span className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" /> : null}
                确认同步
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
