import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** If provided, shows a top option with value="" (replaces <SelectItem value="">) */
  noneLabel?: string
  className?: string
  disabled?: boolean
  square?: boolean
  portal?: boolean
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Cari...',
  emptyText = 'Tidak ditemukan.',
  noneLabel,
  className,
  disabled = false,
  square = false,
  portal = true,
}: SearchableSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [isInsideDialog, setIsInsideDialog] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 256,
  })

  const selectedOption = value === '' ? null : options.find((option) => option.value === value) ?? null

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    const normalizedSelectedLabel = selectedOption?.label.trim().toLowerCase() ?? ''
    const shouldShowAllOptions = open && selectedOption !== null && normalizedSearch === normalizedSelectedLabel

    if (!normalizedSearch || shouldShowAllOptions) {
      return options
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalizedSearch))
  }, [open, options, searchText, selectedOption])

  const exactMatch = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    if (!normalizedSearch) {
      return null
    }

    return options.find((option) => option.label.trim().toLowerCase() === normalizedSearch) ?? null
  }, [options, searchText])

  const shouldUsePortal = portal && !isInsideDialog

  const closeDropdown = (shouldCommitExactMatch = true) => {
    if (shouldCommitExactMatch && exactMatch) {
      onValueChange(exactMatch.value)
      setSearchText(exactMatch.label)
    } else {
      setSearchText(selectedOption?.label ?? '')
    }
    setOpen(false)
  }

  useEffect(() => {
    if (open) {
      return
    }

    setSearchText(selectedOption?.label ?? '')
  }, [open, selectedOption])

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(0)
      return
    }

    setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1)
  }, [filteredOptions, open])

  useEffect(() => {
    if (!open || !shouldUsePortal) {
      return
    }

    const updateDropdownPosition = () => {
      const rect = inputRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }

      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - rect.bottom - 12
      const spaceAbove = rect.top - 12
      const shouldOpenUpward = spaceBelow < 220 && spaceAbove > spaceBelow
      const maxHeight = Math.max(160, Math.min(320, shouldOpenUpward ? spaceAbove : spaceBelow))

      setDropdownStyle({
        top: shouldOpenUpward ? undefined : rect.bottom + 4,
        bottom: shouldOpenUpward ? Math.max(8, viewportHeight - rect.top + 4) : undefined,
        left: rect.left,
        width: rect.width,
        maxHeight,
      })
    }

    updateDropdownPosition()
    window.addEventListener('resize', updateDropdownPosition)
    window.addEventListener('scroll', updateDropdownPosition, true)

    return () => {
      window.removeEventListener('resize', updateDropdownPosition)
      window.removeEventListener('scroll', updateDropdownPosition, true)
    }
  }, [open, shouldUsePortal])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    setIsInsideDialog(Boolean(container.closest('[role="dialog"]')))
  }, [])

  const selectOption = (option: SearchableSelectOption) => {
    onValueChange(option.value)
    setSearchText(option.label)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={searchText}
        placeholder={open ? searchPlaceholder : placeholder}
        onBlur={() => {
          window.requestAnimationFrame(() => {
            const activeElement = document.activeElement
            if (dropdownRef.current?.contains(activeElement) || containerRef.current?.contains(activeElement)) {
              return
            }
            closeDropdown(false)
          })
        }}
        onClick={() => {
          if (!disabled) {
            setOpen(true)
          }
        }}
        onChange={(event) => {
          setSearchText(event.target.value)
          if (!disabled) {
            setOpen(true)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }

            setHighlightedIndex((current) => {
              if (filteredOptions.length === 0) {
                return -1
              }
              if (current < 0) {
                return 0
              }
              return Math.min(current + 1, filteredOptions.length - 1)
            })
            return
          }

          if (event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              setOpen(true)
              return
            }

            setHighlightedIndex((current) => {
              if (filteredOptions.length === 0) {
                return -1
              }
              if (current <= 0) {
                return 0
              }
              return current - 1
            })
            return
          }

          if (event.key === 'Enter') {
            if (!open) {
              return
            }

            event.preventDefault()

            if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
              selectOption(filteredOptions[highlightedIndex])
              return
            }

            if (exactMatch) {
              selectOption(exactMatch)
            }
            return
          }

          if (event.key === 'Escape') {
            closeDropdown(false)
          }
        }}
        className={cn(
          'h-10 w-full pr-10 text-sm font-normal',
          square && 'rounded-none shadow-none',
          className
        )}
      />
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />

      {open
        ? shouldUsePortal && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={dropdownRef}
                className={cn(
                  'fixed z-[120] border bg-popover text-popover-foreground shadow-md',
                  square ? 'rounded-none' : 'rounded-md'
                )}
                style={{
                  top: dropdownStyle.top,
                  bottom: dropdownStyle.bottom,
                  left: dropdownStyle.left,
                  width: dropdownStyle.width,
                }}
              >
                <div className="overflow-auto p-1" style={{ maxHeight: dropdownStyle.maxHeight }}>
                  {noneLabel !== undefined && (
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                        square && 'rounded-none'
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onValueChange('')
                        setSearchText('')
                        setOpen(false)
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{noneLabel}</span>
                    </button>
                  )}

                  {filteredOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>
                  ) : (
                    filteredOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                          highlightedIndex >= 0 && filteredOptions[highlightedIndex]?.value === option.value && 'bg-accent text-accent-foreground',
                          square && 'rounded-none'
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setHighlightedIndex(filteredOptions.findIndex((item) => item.value === option.value))}
                        onClick={() => selectOption(option)}
                      >
                        <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{option.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>,
              document.body
            )
          : (
              <div
                ref={dropdownRef}
                className={cn(
                  'absolute left-0 right-0 top-full z-50 mt-1 border bg-popover text-popover-foreground shadow-md',
                  square ? 'rounded-none' : 'rounded-md'
                )}
              >
                <div className="max-h-64 overflow-auto p-1">
                  {noneLabel !== undefined && (
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                        square && 'rounded-none'
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onValueChange('')
                        setSearchText('')
                        setOpen(false)
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{noneLabel}</span>
                    </button>
                  )}

                  {filteredOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>
                  ) : (
                    filteredOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          'flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                          highlightedIndex >= 0 && filteredOptions[highlightedIndex]?.value === option.value && 'bg-accent text-accent-foreground',
                          square && 'rounded-none'
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setHighlightedIndex(filteredOptions.findIndex((item) => item.value === option.value))}
                        onClick={() => selectOption(option)}
                      >
                        <Check className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{option.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
        : null}
    </div>
  )
}
