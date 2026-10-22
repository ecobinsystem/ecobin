import React from 'react'
import { WifiOff, AlertTriangle, RefreshCw, X } from 'lucide-react'

export default function Esp32OfflineModal({
  isOpen = true,
  onClose,
  onRetry,
  deviceIp = '192.168.43.221'
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
            <WifiOff className="w-7 h-7" />
          </div>

          <h3 className="text-lg font-bold text-slate-900">
            Device Offline
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Please check the device connection.
          </p>

          <div className="w-full bg-slate-50 rounded-xl border border-slate-200 p-3.5 my-4 text-left">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Troubleshooting Checklist</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
              <li>Ensure the Raspberry Pi is powered on</li>
              <li>Verify that the Wi-Fi credentials in firmware match your router</li>
              <li>Confirm the device is assigned IP <span className="font-mono font-bold text-slate-800">{deviceIp}</span></li>
            </ul>
          </div>

          <div className="flex items-center gap-3 w-full">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Connection</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
