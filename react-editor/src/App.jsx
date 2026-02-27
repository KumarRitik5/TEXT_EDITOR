import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { initVimMode } from 'monaco-vim'
import './monacoSetup'
import './App.css'
import LanguagePicker from './components/LanguagePicker'
import { clearSettings, clearState, loadSettings, loadState, saveSettings, saveState } from './lib/storage'
import { guessLanguageFromFilename, openTextFile, saveTextFile } from './lib/files'
import { compileWithPiston, getCompilerLanguage } from './lib/compiler'

const DEFAULT_SETTINGS = {
  theme: 'dark',
  fontSize: 16,
  wordWrap: 'on', // 'on' | 'off'
  minimap: true,
  formatOnSave: true,
  vimMode: false,
  websocketUrl: '',
  collabRoom: 'lobby',
  collabUserName: '',
}

function getDefaultWebSocketUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:5173/ws'
  const host = String(window.location.hostname || '').toLowerCase()
  if (host.endsWith('.vercel.app')) return ''
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/ws`
}

function sanitizeRoomId(value) {
  const clean = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '')
  return clean || 'lobby'
}

function sanitizeUserName(value) {
  const clean = String(value || '').trim()
  if (!clean) return 'Guest'
  return clean.slice(0, 40)
}

function getRoomDocId(roomId) {
  return `room:${sanitizeRoomId(roomId)}`
}

function getRoomDocName(roomId) {
  return `Room ${sanitizeRoomId(roomId)}.txt`
}

function getExt(name) {
  const lower = String(name || '').toLowerCase()
  const idx = lower.lastIndexOf('.')
  if (idx <= -1) return ''
  return lower.slice(idx + 1)
}

function getPrettierParser({ name, language }) {
  const ext = getExt(name)

  // Prefer extension-based decisions for correctness (jsx/tsx).
  if (ext === 'jsx') return 'babel'
  if (ext === 'js') return 'babel'
  if (ext === 'tsx') return 'typescript'
  if (ext === 'ts') return 'typescript'
  if (ext === 'json') return 'json'
  if (ext === 'html') return 'html'
  if (ext === 'css') return 'css'
  if (ext === 'md') return 'markdown'

  // Fallback to language id if extension isn't helpful.
  if (language === 'javascript') return 'babel'
  if (language === 'typescript') return 'typescript'
  if (language === 'json') return 'json'
  if (language === 'html') return 'html'
  if (language === 'css') return 'css'
  if (language === 'markdown') return 'markdown'

  return null
}

let prettierLoaderPromise = null
async function loadPrettier() {
  if (prettierLoaderPromise) return prettierLoaderPromise

  prettierLoaderPromise = (async () => {
    const prettier = (await import('prettier/standalone')).default
    const [babel, estree, typescript, html, postcss, markdown] = await Promise.all([
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
      import('prettier/plugins/typescript'),
      import('prettier/plugins/html'),
      import('prettier/plugins/postcss'),
      import('prettier/plugins/markdown'),
    ])

    const plugins = [
      babel.default ?? babel,
      estree.default ?? estree,
      typescript.default ?? typescript,
      html.default ?? html,
      postcss.default ?? postcss,
      markdown.default ?? markdown,
    ]

    return { prettier, plugins }
  })()

  return prettierLoaderPromise
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + Math.random().toString(16).slice(2)
}

function createDoc({ id, name, language, value }) {
  return {
    id: id || makeId(),
    name: name || 'Untitled',
    language: language || 'plaintext',
    value: value || '',
    savedValue: value || '',
    updatedAt: Date.now(),
  }
}

function countStats(text) {
  const trimmed = text.trim()
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  const chars = text.length
  const lines = text.length === 0 ? 1 : text.split(/\r\n|\r|\n/).length
  return { words, chars, lines }
}

export default function App() {
  const fileHandlesRef = useRef(new Map()) // docId -> FileSystemFileHandle

  const monacoRef = useRef(null)
  const editorRef = useRef(null)
  const vimModeRef = useRef(null)
  const vimStatusRef = useRef(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 })
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [participants, setParticipants] = useState([])

  const [settings, setSettingsState] = useState(() => ({ ...DEFAULT_SETTINGS, ...(loadSettings() || {}) }))

  const [docs, setDocs] = useState(() => {
    const state = loadState()
    if (state?.docs?.length) return state.docs
    return [createDoc({ name: 'Untitled 1', language: 'plaintext', value: '' })]
  })

  const [activeId, setActiveId] = useState(() => {
    const state = loadState()
    if (state?.activeId) return state.activeId
    if (state?.docs?.[0]?.id) return state.docs[0].id
    return null
  })

  const activeDoc = useMemo(() => {
    const fallback = docs[0] || null
    const pick = docs.find(d => d.id === activeId) || fallback
    return pick
  }, [docs, activeId])

  const [toastMsg, setToastMsg] = useState('')
  const [isCompiling, setIsCompiling] = useState(false)
  const toastTimer = useRef(null)
  const wsRef = useRef(null)
  const wsClientIdRef = useRef(makeId())
  const remoteSyncRef = useRef(false)
  const wsSyncTimerRef = useRef(null)

  const toast = useCallback((message) => {
    setToastMsg(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 1600)
  }, [])

  const setSettings = useCallback((patch) => {
    setSettingsState(s => ({ ...s, ...patch }))
  }, [])

  const isVercelHost = useMemo(() => {
    if (typeof window === 'undefined') return false
    const host = String(window.location.hostname || '').toLowerCase()
    return host.endsWith('.vercel.app')
  }, [])

  const collabRoomId = useMemo(() => sanitizeRoomId(settings.collabRoom), [settings.collabRoom])
  const collabUserName = useMemo(() => sanitizeUserName(settings.collabUserName), [settings.collabUserName])

  const copyRoomShareLink = useCallback(async () => {
    try {
      if (typeof window === 'undefined' || !window.navigator?.clipboard) {
        toast('Clipboard not available')
        return
      }

      const url = new URL(window.location.href)
      url.searchParams.set('room', collabRoomId)
      if (settings.websocketUrl) {
        url.searchParams.set('ws', settings.websocketUrl)
      } else {
        url.searchParams.delete('ws')
      }

      await window.navigator.clipboard.writeText(url.toString())
      toast('Room link copied')
    } catch {
      toast('Could not copy room link')
    }
  }, [collabRoomId, settings.websocketUrl, toast])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const room = params.get('room')
    const ws = params.get('ws')
    const name = params.get('name')

    if (!room && !ws && !name) return

    setSettingsState(prev => ({
      ...prev,
      collabRoom: room || prev.collabRoom,
      websocketUrl: ws || prev.websocketUrl,
      collabUserName: name || prev.collabUserName,
    }))
  }, [])

  const ensureRoomDoc = useCallback((roomId) => {
    const roomDocId = getRoomDocId(roomId)
    const roomDocName = getRoomDocName(roomId)

    setDocs(prev => {
      const exists = prev.some(d => d.id === roomDocId)
      if (exists) {
        return prev.map(d => {
          if (d.id !== roomDocId || d.name === roomDocName) return d
          return { ...d, name: roomDocName }
        })
      }

      return [...prev, createDoc({
        id: roomDocId,
        name: roomDocName,
        language: 'plaintext',
        value: '',
      })]
    })

    setActiveId(roomDocId)
  }, [])

  const disconnectWebSocket = useCallback(() => {
    const socket = wsRef.current
    if (!socket) {
      setWsStatus('disconnected')
      return
    }

    wsRef.current = null
    try {
      socket.close(1000, 'client disconnect')
    } catch {
      // ignore
    }
    setParticipants([])
    setWsStatus('disconnected')
  }, [])

  const connectWebSocket = useCallback(() => {
    const wsUrl = String(settings.websocketUrl || getDefaultWebSocketUrl()).trim()
    if (!wsUrl) {
      toast(isVercelHost ? 'Set external WebSocket host first' : 'Enter a WebSocket URL first')
      return
    }

    if (!/^wss?:\/\//i.test(wsUrl)) {
      toast('WebSocket URL must start with ws:// or wss://')
      return
    }

    disconnectWebSocket()
    setWsStatus('connecting')
    setParticipants([])

    try {
      const joinUrl = new URL(wsUrl)
      joinUrl.searchParams.set('room', collabRoomId)
      joinUrl.searchParams.set('name', collabUserName)
      joinUrl.searchParams.set('clientId', wsClientIdRef.current)

      const socket = new WebSocket(joinUrl.toString())
      wsRef.current = socket

      socket.onopen = () => {
        if (wsRef.current !== socket) return
        setWsStatus('connected')
        ensureRoomDoc(collabRoomId)

        try {
          socket.send(JSON.stringify({
            type: 'join',
            roomId: collabRoomId,
            userName: collabUserName,
            clientId: wsClientIdRef.current,
          }))
        } catch {
          // ignore
        }

        toast(`Connected to room: ${collabRoomId}`)
      }

      socket.onmessage = (event) => {
        let data = null
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }

        if (!data) return

        if (data.type === 'presence:update') {
          if (data.roomId && sanitizeRoomId(data.roomId) !== collabRoomId) return
          const next = Array.isArray(data.participants) ? data.participants : []
          setParticipants(next)
          return
        }

        if (data.type === 'room:state') {
          if (data.roomId && sanitizeRoomId(data.roomId) !== collabRoomId) return

          const next = Array.isArray(data.participants) ? data.participants : []
          setParticipants(next)

          if (!data.doc || typeof data.doc !== 'object') return

          const roomDocId = getRoomDocId(collabRoomId)
          ensureRoomDoc(collabRoomId)
          remoteSyncRef.current = true
          setDocs(prev => prev.map(d => {
            if (d.id !== roomDocId) return d
            return {
              ...d,
              name: data.doc.name || d.name,
              language: data.doc.language || d.language,
              value: String(data.doc.value ?? ''),
              updatedAt: Date.now(),
            }
          }))
          return
        }

        if (data.clientId === wsClientIdRef.current) return
        if (data.type !== 'doc:sync' || !data.doc) return
        if (data.roomId && sanitizeRoomId(data.roomId) !== collabRoomId) return

        const roomDocId = getRoomDocId(collabRoomId)
        ensureRoomDoc(collabRoomId)

        remoteSyncRef.current = true
        setDocs(prev => {
          const index = prev.findIndex(d => d.id === roomDocId)
          if (index === -1) {
            return [...prev, {
              id: roomDocId,
              name: data.doc.name || getRoomDocName(collabRoomId),
              language: data.doc.language || 'plaintext',
              value: data.doc.value || '',
              savedValue: data.doc.value || '',
              updatedAt: Date.now(),
            }]
          }

          return prev.map(d => {
            if (d.id !== roomDocId) return d
            return {
              ...d,
              name: data.doc.name || d.name,
              language: data.doc.language || d.language,
              value: String(data.doc.value ?? ''),
              updatedAt: Date.now(),
            }
          })
        })
      }

      socket.onerror = () => {
        if (wsRef.current !== socket) return
        toast('WebSocket error')
      }

      socket.onclose = () => {
        if (wsRef.current === socket) wsRef.current = null
        setParticipants([])
        setWsStatus('disconnected')
      }
    } catch {
      setWsStatus('disconnected')
      toast('WebSocket connection failed')
    }
  }, [collabRoomId, collabUserName, disconnectWebSocket, ensureRoomDoc, isVercelHost, settings.websocketUrl, toast])

  const compileActiveDoc = useCallback(async () => {
    if (!activeDoc || isCompiling) return

    if (!getCompilerLanguage(activeDoc.language)) {
      toast('Selected language is not supported for compilation')
      return
    }

    try {
      setIsCompiling(true)
      const result = await compileWithPiston({
        language: activeDoc.language,
        code: activeDoc.value,
      })

      const rawOutput = [result.stdout, result.stderr, result.output].find(Boolean) || 'No output'
      const preview = rawOutput.replace(/\s+/g, ' ').trim().slice(0, 120)

      if (result.success) {
        toast(preview ? `Compiled successfully: ${preview}` : 'Compiled successfully')
      } else {
        toast(preview ? `Compile failed: ${preview}` : `Compile failed (exit ${result.code})`)
      }
    } catch (error) {
      toast(String(error?.message || 'Compilation failed'))
    } finally {
      setIsCompiling(false)
    }
  }, [activeDoc, isCompiling, toast])

  function onBeforeEditorMount(monaco) {
    // Ensure JSX/TSX tokenize well when editing React files.
    try {
      const ts = monaco.languages?.typescript
      if (ts?.javascriptDefaults && ts?.typescriptDefaults && ts?.JsxEmit) {
        const base = {
          allowNonTsExtensions: true,
          target: ts.ScriptTarget?.ES2020 ?? undefined,
          jsx: ts.JsxEmit.ReactJSX,
        }
        ts.javascriptDefaults.setCompilerOptions(base)
        ts.typescriptDefaults.setCompilerOptions(base)
      }
    } catch {
      // ignore
    }

    // Define themes *before* the editor is created.
    // Otherwise Monaco can fall back to its default light theme on first paint.
    monaco.editor.defineTheme('textory-noir', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'E9EDF2' },
        { token: 'comment', foreground: '8A97B2' },
        { token: 'string', foreground: 'B8F3D2' },
        { token: 'number', foreground: 'A6C8FF' },
        { token: 'keyword', foreground: 'D2B6FF' },
        { token: 'type.identifier', foreground: 'FFD6A5' },
      ],
      colors: {
        'editor.background': '#0D1324',
        'editor.foreground': '#E9EDF2',
        'editorLineNumber.foreground': '#55627B',
        'editorLineNumber.activeForeground': '#A6C8FF',
        'editorCursor.foreground': '#A6C8FF',
        'editor.selectionBackground': '#1B2A4A',
        'editor.inactiveSelectionBackground': '#141F36',
        'editor.findMatchBackground': '#2A2440',
        'editor.findMatchHighlightBackground': '#1D2B2A',
        'editorIndentGuide.background1': '#1A2440',
        'editorIndentGuide.activeBackground1': '#2A3B64',
      },
    })

    monaco.editor.defineTheme('textory-paper', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '0B0C10' },
        { token: 'comment', foreground: '68707D' },
        { token: 'string', foreground: '0C7A55' },
        { token: 'number', foreground: '1F6BFF' },
        { token: 'keyword', foreground: '4A2AE3' },
        { token: 'type.identifier', foreground: 'A33B00' },
      ],
      colors: {
        'editor.background': '#FFFDF7',
        'editor.foreground': '#0B0C10',
        'editorLineNumber.foreground': '#9AA3AF',
        'editorLineNumber.activeForeground': '#1F6BFF',
        'editorCursor.foreground': '#1F6BFF',
        'editor.selectionBackground': '#DCE8FF',
        'editor.inactiveSelectionBackground': '#EEF4FF',
        'editorIndentGuide.background1': '#E8E3D7',
        'editorIndentGuide.activeBackground1': '#D2CCBF',
      },
    })
  }

  function onEditorMount(editor, monaco) {
    editorRef.current = editor
    monacoRef.current = monaco

    // Register a Prettier-based formatter for common web languages.
    // This makes Monaco's built-in "Format Document" action work consistently.
    const register = (languageId) => {
      monaco.languages.registerDocumentFormattingEditProvider(languageId, {
        provideDocumentFormattingEdits: async (model) => {
          const inferredName = model?.uri?.path ? model.uri.path.split('/').pop() : ''
          const parser = getPrettierParser({ name: inferredName, language: model.getLanguageId() })
          if (!parser) return []

          try {
            const { prettier, plugins } = await loadPrettier()
            const formatted = await prettier.format(model.getValue(), {
              parser,
              plugins,
              tabWidth: 2,
              useTabs: false,
              semi: true,
              singleQuote: true,
              trailingComma: 'es5',
              bracketSpacing: true,
              printWidth: 100,
              endOfLine: 'auto',
            })
            return [{ range: model.getFullModelRange(), text: formatted }]
          } catch {
            return []
          }
        },
      })
    }

    register('javascript')
    register('typescript')
    register('json')
    register('html')
    register('css')
    register('markdown')

    // Keep cursor position updated for status bar.
    setCursorPos({
      line: editor.getPosition()?.lineNumber ?? 1,
      col: editor.getPosition()?.column ?? 1,
    })

    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({
        line: e.position?.lineNumber ?? 1,
        col: e.position?.column ?? 1,
      })
    })
  }

  // Vim mode (monaco-vim)
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const statusEl = vimStatusRef.current

    // Dispose any previous instance before (re)initializing.
    if (vimModeRef.current) {
      try { vimModeRef.current.dispose() } catch { /* ignore */ }
      vimModeRef.current = null
    }

    if (!settings.vimMode) {
      if (statusEl) statusEl.textContent = ''
      return
    }

    // Status node is optional but makes Vim feel much more usable.
    const statusNode = statusEl || undefined
    try {
      vimModeRef.current = initVimMode(editor, statusNode)
    } catch {
      // Avoid sync state updates inside effects (eslint rule).
      setTimeout(() => {
        toast('Vim mode not available')
        setSettings({ vimMode: false })
      }, 0)
    }

    return () => {
      if (vimModeRef.current) {
        try { vimModeRef.current.dispose() } catch { /* ignore */ }
        vimModeRef.current = null
      }
      if (statusEl) statusEl.textContent = ''
    }
  }, [settings.vimMode, setSettings, toast])

  // Monaco doesn't always update an existing model's language just because the `language` prop changes.
  // Force it whenever the active tab or language changes.
  useEffect(() => {
    if (!activeDoc) return
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return
    monaco.editor.setModelLanguage(model, activeDoc.language || 'plaintext')
  }, [activeDoc])

  const activeDirty = !!activeDoc && activeDoc.value !== activeDoc.savedValue

  // Apply theme to document
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme

    // Keep Monaco aligned with the UI theme.
    const monaco = monacoRef.current
    if (monaco) {
      monaco.editor.setTheme(settings.theme === 'dark' ? 'textory-noir' : 'textory-paper')
    }
  }, [settings.theme])

  // Persist settings
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // Autosave app state
  const autosaveTimer = useRef(null)
  useEffect(() => {
    clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      saveState({
        docs: docs.map(d => ({
          id: d.id,
          name: d.name,
          language: d.language,
          value: d.value,
          savedValue: d.savedValue,
          updatedAt: d.updatedAt,
        })),
        activeId: activeDoc?.id || null,
      })
    }, 500)

    return () => clearTimeout(autosaveTimer.current)
  }, [docs, activeDoc?.id])

  const newDoc = useCallback(() => {
    const n = docs.filter(d => d.name.startsWith('Untitled')).length + 1
    const doc = createDoc({ name: `Untitled ${n}`, language: 'plaintext', value: '' })
    setDocs(prev => [...prev, doc])
    setActiveId(doc.id)
    toast('New document')
  }, [docs, toast])

  const openDoc = useCallback(async () => {
    try {
      const { name, text, handle } = await openTextFile()
      const language = guessLanguageFromFilename(name)
      const doc = createDoc({ name, language, value: text })
      setDocs(prev => [...prev, doc])
      setActiveId(doc.id)
      if (handle) fileHandlesRef.current.set(doc.id, handle)
      toast(`Opened: ${name}`)
    } catch (e) {
      const msg = String(e?.message || '')
      const name = String(e?.name || '')
      if (name === 'AbortError' || msg.toLowerCase().includes('cancel')) return
      toast('Open failed')
    }
  }, [toast])

  const saveDoc = useCallback(async ({ saveAs = false } = {}) => {
    if (!activeDoc) return
    try {
      if (settings.formatOnSave) {
        const editor = editorRef.current
        if (editor) {
          try {
            await editor.getAction('editor.action.formatDocument')?.run()
          } catch {
            // ignore
          }
        }
      }

      const existingHandle = saveAs ? null : (fileHandlesRef.current.get(activeDoc.id) || null)
      const { handle } = await saveTextFile({
        suggestedName: activeDoc.name,
        text: activeDoc.value,
        existingHandle,
      })

      if (handle) fileHandlesRef.current.set(activeDoc.id, handle)

      setDocs(prev => prev.map(d => {
        if (d.id !== activeDoc.id) return d
        return {
          ...d,
          savedValue: d.value,
          updatedAt: Date.now(),
          name: handle?.name || d.name,
        }
      }))

      toast('Saved')
    } catch (e) {
      const msg = String(e?.message || '')
      const name = String(e?.name || '')
      if (name === 'AbortError' || msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('cancel')) return
      toast('Save failed')
    }
  }, [activeDoc, settings.formatOnSave, toast])

  function formatDoc() {
    const editor = editorRef.current
    if (!editor) return
    // Monaco formatting (backed by Prettier for common languages via providers above).
    editor.getAction('editor.action.formatDocument')?.run()
      .then(() => toast('Formatted'))
      .catch(() => toast('Format not available'))
  }

  function renameDoc(docId) {
    const doc = docs.find(d => d.id === docId)
    if (!doc) return
    const next = prompt('Rename tab:', doc.name)
    if (!next) return

    const guessed = guessLanguageFromFilename(next)
    setDocs(prev => prev.map(d => {
      if (d.id !== docId) return d
      const nextLang = guessed === 'plaintext' ? d.language : guessed
      return { ...d, name: next, language: nextLang, updatedAt: Date.now() }
    }))
  }

  function closeDoc(docId) {
    const doc = docs.find(d => d.id === docId)
    if (!doc) return
    const isDirty = doc.value !== doc.savedValue
    if (isDirty && !confirm(`"${doc.name}" has unsaved changes. Close anyway?`)) return

    fileHandlesRef.current.delete(docId)

    setDocs(prev => {
      const next = prev.filter(d => d.id !== docId)
      if (next.length === 0) {
        const fresh = createDoc({ name: 'Untitled 1', language: 'plaintext', value: '' })
        setActiveId(fresh.id)
        return [fresh]
      }

      if (activeDoc?.id === docId) {
        const idx = prev.findIndex(d => d.id === docId)
        const nextActive = next[Math.min(idx, next.length - 1)]
        setActiveId(nextActive.id)
      }

      return next
    })
  }

  function updateActive(patch) {
    if (!activeDoc) return
    setDocs(prev => prev.map(d => (d.id === activeDoc.id ? { ...d, ...patch, updatedAt: Date.now() } : d)))
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e) {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return

      if (e.key === 'Enter') {
        e.preventDefault()
        compileActiveDoc()
        return
      }

      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        // Ctrl+Shift+S => Save As
        saveDoc({ saveAs: e.shiftKey })
      } else if (k === 'o') {
        e.preventDefault()
        openDoc()
      } else if (k === 'n') {
        e.preventDefault()
        newDoc()
      } else if (k === '/') {
        // Ctrl+/ => Settings
        e.preventDefault()
        setSettingsOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [compileActiveDoc, newDoc, openDoc, saveDoc])

  // Warn on unload if any doc dirty
  useEffect(() => {
    function beforeUnload(e) {
      const anyDirty = docs.some(d => d.value !== d.savedValue)
      if (!anyDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [docs])

  // Broadcast active doc updates through websocket.
  useEffect(() => {
    const socket = wsRef.current
    if (!socket || wsStatus !== 'connected' || !activeDoc) return

    const roomDocId = getRoomDocId(collabRoomId)
    if (activeDoc.id !== roomDocId) return

    if (remoteSyncRef.current) {
      remoteSyncRef.current = false
      return
    }

    clearTimeout(wsSyncTimerRef.current)
    wsSyncTimerRef.current = setTimeout(() => {
      const liveSocket = wsRef.current
      if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return

      try {
        liveSocket.send(JSON.stringify({
          type: 'doc:sync',
          roomId: collabRoomId,
          userName: collabUserName,
          clientId: wsClientIdRef.current,
          doc: {
            id: roomDocId,
            name: activeDoc.name,
            language: activeDoc.language,
            value: activeDoc.value,
            updatedAt: Date.now(),
          },
        }))
      } catch {
        // ignore transient send failures
      }
    }, 220)

    return () => clearTimeout(wsSyncTimerRef.current)
  }, [activeDoc, collabRoomId, collabUserName, wsStatus])

  // Cleanup websocket on unmount.
  useEffect(() => {
    return () => {
      clearTimeout(wsSyncTimerRef.current)
      const socket = wsRef.current
      wsRef.current = null
      if (!socket) return
      try {
        socket.close(1000, 'app unmount')
      } catch {
        // ignore
      }
    }
  }, [])

  // Close settings on Escape
  useEffect(() => {
    if (!settingsOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen])

  // Drag & drop open
  const dropRef = useRef(null)
  useEffect(() => {
    const node = dropRef.current
    if (!node) return

    function onDragOver(e) {
      e.preventDefault()
    }
    async function onDrop(e) {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      const text = await file.text()
      const doc = createDoc({
        name: file.name,
        language: guessLanguageFromFilename(file.name),
        value: text,
      })
      setDocs(prev => [...prev, doc])
      setActiveId(doc.id)
      toast(`Opened: ${file.name}`)
    }

    node.addEventListener('dragover', onDragOver)
    node.addEventListener('drop', onDrop)
    return () => {
      node.removeEventListener('dragover', onDragOver)
      node.removeEventListener('drop', onDrop)
    }
  }, [toast])

  const stats = useMemo(() => countStats(activeDoc?.value || ''), [activeDoc?.value])

  const languageOptions = [
    { label: 'Plain text', value: 'plaintext' },
    { label: 'JavaScript', value: 'javascript' },
    { label: 'TypeScript', value: 'typescript' },
    { label: 'Java', value: 'java' },
    { label: 'JSON', value: 'json' },
    { label: 'Markdown', value: 'markdown' },
    { label: 'HTML', value: 'html' },
    { label: 'CSS', value: 'css' },
    { label: 'Python', value: 'python' },
    { label: 'C/C++', value: 'cpp' },
    { label: 'C#', value: 'csharp' },
    { label: 'Go', value: 'go' },
    { label: 'Rust', value: 'rust' },
    { label: 'PHP', value: 'php' },
    { label: 'Shell', value: 'shell' },
    { label: 'YAML', value: 'yaml' },
    { label: 'XML', value: 'xml' },
    { label: 'SQL', value: 'sql' },
  ]

  return (
    <div className="app" ref={dropRef}>
      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden="true" />
          <div className="brandText">
            <div className="title">Textory</div>
            <div className="subtitle">
              {activeDoc ? `${activeDoc.name}${activeDirty ? ' • unsaved' : ''}` : 'No document'}
            </div>
          </div>
        </div>

        <div className="toolbar" role="toolbar" aria-label="Editor toolbar">
          <button className="btn" type="button" onClick={newDoc} title="New (Ctrl+N)">New</button>
          <button className="btn" type="button" onClick={openDoc} title="Open (Ctrl+O)">Open</button>
          <button className="btn btnPrimary" type="button" onClick={() => saveDoc({ saveAs: false })} title="Save (Ctrl+S)">Save</button>

          <div className="divider" aria-hidden="true" />

          <LanguagePicker
            value={activeDoc?.language || 'plaintext'}
            options={languageOptions}
            disabled={!activeDoc}
            onChange={(next) => updateActive({ language: next })}
          />

          <label className="field" title="Realtime websocket host URL">
            <span className="fieldLabel">WS Host</span>
            <input
              className="input wsInput"
              type="text"
              value={settings.websocketUrl || ''}
              onChange={(e) => setSettings({ websocketUrl: e.target.value })}
              placeholder={isVercelHost ? 'wss://your-realtime-host/ws' : (getDefaultWebSocketUrl() || 'ws://localhost:5173/ws')}
            />
          </label>

          <label className="field" title="Collaboration room id">
            <span className="fieldLabel">Room</span>
            <input
              className="input roomInput"
              type="text"
              value={settings.collabRoom || ''}
              onChange={(e) => setSettings({ collabRoom: e.target.value })}
              placeholder="lobby"
            />
          </label>

          <label className="field" title="Your display name">
            <span className="fieldLabel">Name</span>
            <input
              className="input nameInput"
              type="text"
              value={settings.collabUserName || ''}
              onChange={(e) => setSettings({ collabUserName: e.target.value })}
              placeholder="Guest"
            />
          </label>

          <button
            className="btn"
            type="button"
            onClick={wsStatus === 'connected' ? disconnectWebSocket : connectWebSocket}
            title={wsStatus === 'connected' ? 'Disconnect WebSocket' : 'Connect WebSocket'}
          >
            {wsStatus === 'connected' ? 'Disconnect WS' : wsStatus === 'connecting' ? 'Connecting…' : 'Connect WS'}
          </button>

          <button
            className="btn"
            type="button"
            onClick={copyRoomShareLink}
            title="Copy share link with room and websocket host"
          >
            Share Room
          </button>

          <button
            className="btn"
            type="button"
            onClick={compileActiveDoc}
            disabled={!activeDoc || isCompiling || !getCompilerLanguage(activeDoc?.language)}
            title="Compile (Ctrl+Enter)"
          >
            {isCompiling ? 'Compiling…' : 'Compile'}
          </button>

          <button
            className="btn"
            type="button"
            onClick={() => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            title="Toggle theme"
          >
            {settings.theme === 'dark' ? 'Dark' : 'Light'}
          </button>

          <button className="btn" type="button" onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+/)">
            Settings
          </button>
        </div>
      </header>

      {isVercelHost ? (
        <div className="deployHint" role="status" aria-live="polite">
          Vercel mode: set external WS Host for live collaboration.
        </div>
      ) : null}

      <nav className="tabs" aria-label="Open documents">
        {docs.map((d) => {
          const isActive = d.id === activeDoc?.id
          const isDirty = d.value !== d.savedValue
          return (
            <div
              key={d.id}
              className={`tab ${isActive ? 'tabActive' : ''}`}
              onClick={() => setActiveId(d.id)}
              onDoubleClick={() => renameDoc(d.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setActiveId(d.id)
              }}
              title={d.name}
            >
              <span className="tabName">{d.name}</span>
              <span className="tabMeta">{isDirty ? '●' : ''}{d.language}</span>
              <button
                className="tabClose"
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  closeDoc(d.id)
                }}
                aria-label={`Close ${d.name}`}
                title="Close tab"
              >
                ×
              </button>
            </div>
          )
        })}
      </nav>

      <main className="main">
        <div className="editorFrame">
          {activeDoc ? (
            <Editor
              height="100%"
              defaultLanguage="plaintext"
              path={`${activeDoc.id}/${activeDoc.name || 'document.txt'}`}
              language={activeDoc.language}
              value={activeDoc.value}
              theme={settings.theme === 'dark' ? 'textory-noir' : 'textory-paper'}
              beforeMount={onBeforeEditorMount}
              onMount={onEditorMount}
              onChange={(value) => {
                updateActive({ value: value ?? '' })
              }}
              options={{
                fontSize: settings.fontSize,
                wordWrap: settings.wordWrap,
                minimap: { enabled: settings.minimap },
                formatOnPaste: true,
                formatOnType: true,
                autoClosingBrackets: 'always',
                autoClosingQuotes: 'always',
                autoIndent: 'full',
                smoothScrolling: true,
                cursorSmoothCaretAnimation: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                renderLineHighlight: 'all',
              }}
            />
          ) : null}
        </div>
      </main>

      <footer className="statusbar" aria-label="Status bar">
        <div className="statusLeft">
          <span className="pill">Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span className="pill">Words: {stats.words}</span>
        </div>
        <div className="statusRight">
          <span className="pill">Mode: {isVercelHost ? 'Vercel' : 'Local'}</span>
          <span className="pill">WS: {wsStatus}</span>
          <span className="pill">Room: {collabRoomId}</span>
          <span className="pill">You: {collabUserName}</span>
          <span className="pill">Peers: {participants.length}</span>
          <span
            className="pill"
            ref={vimStatusRef}
            title="Vim status"
            aria-label="Vim status"
          />
          <span className="pill">{activeDirty ? 'Unsaved' : 'Saved'}</span>
          <span className="pill">{activeDoc?.language || 'plaintext'}</span>
        </div>
      </footer>

      {settingsOpen ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false)
          }}
        >
          <div className="modal">
            <div className="modalHeader">
              <div className="modalTitle">Settings</div>
              <button className="btn" type="button" onClick={() => setSettingsOpen(false)} title="Close (Esc)">Close</button>
            </div>

            <div className="modalBody">
              <div className="settingsGrid">
                <div className="helpCard">
                  <div className="helpCardTitle">Editor</div>
                  <div className="helpCardText">
                    <div className="settingsRow">
                      <label className="field" title="Font size">
                        <span className="fieldLabel">Font</span>
                        <input
                          className="input"
                          type="number"
                          min="10"
                          max="36"
                          step="1"
                          value={settings.fontSize}
                          onChange={(e) => setSettings({ fontSize: Math.max(10, Math.min(36, Number(e.target.value) || 16)) })}
                        />
                      </label>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => setSettings({ wordWrap: settings.wordWrap === 'on' ? 'off' : 'on' })}
                        title="Wrap: on = wrap long lines, off = horizontal scroll"
                      >
                        Wrap: {settings.wordWrap}
                      </button>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => setSettings({ minimap: !settings.minimap })}
                        title="Toggle minimap"
                      >
                        Minimap: {settings.minimap ? 'on' : 'off'}
                      </button>
                    </div>

                    <div className="settingsRow">
                      <button
                        className="btn"
                        type="button"
                        onClick={() => setSettings({ formatOnSave: !settings.formatOnSave })}
                        title="Automatically formats supported files on Save"
                      >
                        Format on Save: {settings.formatOnSave ? 'on' : 'off'}
                      </button>

                      <button
                        className="btn"
                        type="button"
                        onClick={() => setSettings({ vimMode: !settings.vimMode })}
                        title="Toggle Vim motions (Esc to Normal mode)"
                      >
                        Vim: {settings.vimMode ? 'on' : 'off'}
                      </button>
                    </div>

                    <div className="settingsRow">
                      <button className="btn" type="button" onClick={formatDoc} title="Format document (Shift+Alt+F)">
                        Format Document
                      </button>
                      <button className="btn" type="button" onClick={() => saveDoc({ saveAs: true })} title="Save As (Ctrl+Shift+S)">
                        Save As
                      </button>
                    </div>
                  </div>
                </div>

                <div className="helpCard">
                  <div className="helpCardTitle">Shortcuts</div>
                  <div className="helpCardText">
                    Ctrl+N: New tab<br />
                    Ctrl+O: Open file<br />
                    Ctrl+S: Save<br />
                    Ctrl+Shift+S: Save As<br />
                    Ctrl+F / Ctrl+H: Find / Replace<br />
                    Ctrl+/: Settings
                  </div>
                </div>

                <div className="helpCard">
                  <div className="helpCardTitle">About</div>
                  <div className="helpCardText">
                    Double-click a tab to rename it. Renaming to a known extension (like <code>main.py</code>) auto-switches language.
                    <div className="settingsRow">
                      <a className="creditsLink" href="https://github.com/KumarRitik5" target="_blank" rel="noreferrer">GitHub</a>
                      <a className="creditsLink" href="mailto:ritikkumar12bicbly@gmail.com">Email</a>
                    </div>
                  </div>
                </div>

                <div className="helpCard">
                  <div className="helpCardTitle">Danger Zone</div>
                  <div className="helpCardText">
                    <button
                      className="btn btnDanger"
                      type="button"
                      onClick={() => {
                        if (!confirm('Clear autosave + settings?')) return
                        clearState()
                        clearSettings()
                        setSettingsState({ ...DEFAULT_SETTINGS })
                        const fresh = createDoc({ name: 'Untitled 1', language: 'plaintext', value: '' })
                        setDocs([fresh])
                        setActiveId(fresh.id)
                        toast('Cleared local data')
                        setSettingsOpen(false)
                      }}
                      title="Clear saved state"
                    >
                      Clear Local Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toastMsg ? <div className="toast" role="status" aria-live="polite">{toastMsg}</div> : null}
    </div>
  )
}
