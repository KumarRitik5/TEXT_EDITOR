import { useEffect, useMemo, useRef, useState } from 'react'

export default function LanguagePicker({
  value,
  options,
  disabled,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  const selected = useMemo(() => {
    return options.find(o => o.value === value) || options[0]
  }, [options, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    function onDocMouseDown(e) {
      const root = rootRef.current
      if (!root) return
      if (!root.contains(e.target)) setOpen(false)
    }

    function onDocKeyDown(e) {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onDocKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onDocKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    // Focus search after popover opens.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  function pick(nextValue) {
    onChange?.(nextValue)
    setOpen(false)
  }

  return (
    <div className={`lpRoot ${disabled ? 'lpDisabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="lpButton"
        onClick={() => {
          if (disabled) return
          setOpen(v => {
            const next = !v
            if (next) setQuery('')
            return next
          })
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        title="Language"
      >
        <span className="lpLabel">Lang</span>
        <span className="lpValue">{selected?.label ?? value}</span>
        <span className="lpChevron" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="lpPopover" role="dialog" aria-label="Language picker">
          <div className="lpSearchRow">
            <input
              ref={inputRef}
              className="lpSearch"
              type="text"
              placeholder="Search language…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="lpList" role="listbox" aria-label="Languages">
            {filtered.length === 0 ? (
              <div className="lpEmpty">No matches</div>
            ) : (
              filtered.map(o => {
                const isActive = o.value === value
                return (
                  <button
                    key={o.value}
                    type="button"
                    className={`lpItem ${isActive ? 'lpItemActive' : ''}`}
                    onClick={() => pick(o.value)}
                    role="option"
                    aria-selected={isActive}
                    title={o.value}
                  >
                    <span className="lpItemLabel">{o.label}</span>
                    <span className="lpItemValue">{o.value}</span>
                  </button>
                )
              })
            )}
          </div>

          <div className="lpHint">Tip: Ctrl+F / Ctrl+H uses Monaco find/replace.</div>
        </div>
      ) : null}
    </div>
  )
}
