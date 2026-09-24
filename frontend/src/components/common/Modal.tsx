import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open?: boolean
  isOpen?: boolean
  onClose: () => void
  title: string
  children: ReactNode
  maxWidth?: string
  footer?: ReactNode
}

export function Modal({ open, isOpen, onClose, title, children, maxWidth = '480px', footer }: ModalProps) {
  const isVisible = open ?? isOpen ?? false
  const overlayRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    if (!isVisible) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isVisible, onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = isVisible ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isVisible])

  if (!isVisible) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div
        className="animate-modal-in bg-white rounded-2xl shadow-[0_8px_40px_rgba(20,50,60,0.18)] w-full flex flex-col overflow-hidden"
        style={{ maxWidth }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e4ebeb]">
          <h2 className="text-[15px] font-bold text-[#172b35] leading-tight">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-lg text-[#6e7d82] hover:bg-[#eef3f3] hover:text-[#172b35] transition-colors"
            aria-label="Đóng"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto max-h-[70vh]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 py-3.5 border-t border-[#e4ebeb] flex gap-2.5 justify-end bg-[#fafcfc]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
