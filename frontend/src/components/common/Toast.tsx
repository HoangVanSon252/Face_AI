import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = (message: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
  }

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 items-end pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastItemView key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItemView({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3800)
    return () => clearTimeout(timer)
  }, [onClose])

  const config = {
    success: {
      icon: <CheckCircle2 size={17} />,
      cls: 'bg-[#e0f7f4] border-[#148f83] text-[#0f6b62]',
      iconCls: 'text-[#148f83]',
    },
    error: {
      icon: <AlertCircle size={17} />,
      cls: 'bg-[#fbe8e2] border-[#c96d58] text-[#9b3d2c]',
      iconCls: 'text-[#c96d58]',
    },
    info: {
      icon: <Info size={17} />,
      cls: 'bg-[#e7effb] border-[#527db8] text-[#2d4f8a]',
      iconCls: 'text-[#527db8]',
    },
  }

  const { icon, cls, iconCls } = config[toast.type]

  return (
    <div
      className={`animate-slide-in pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg min-w-[260px] max-w-[360px] ${cls}`}
    >
      <span className={iconCls}>{icon}</span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={onClose}
        className="ml-1 rounded-md p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Đóng"
      >
        <X size={14} />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
