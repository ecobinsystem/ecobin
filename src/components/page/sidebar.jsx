import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import {
  LayoutDashboard,
  Bell,
  Settings,
  BarChart3,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Wifi,
  WifiOff
} from 'lucide-react'
import logo from '../../public/img/logo.png'

export default function Sidebar({
  activeTab = 'dashboard',
  onTabChange,
  onLogout,
  deviceIp = '10.114.0.180',
  isOnline: propIsOnline
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    let active = true
    let consecutiveFailures = 0
    let lastRecordTimestamp = 0

    const checkStatus = async () => {
      const hasRecentRecord = lastRecordTimestamp > 0 && (Date.now() - lastRecordTimestamp < 30000)

      let pingSuccess = false

      if (deviceIp && deviceIp !== '0.0.0.0') {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 2000)
          const res = await fetch(`http://${deviceIp}/api/status`, {
            signal: controller.signal,
            mode: 'cors'
          })
          clearTimeout(timeout)
          if (res.ok) {
            const data = await res.json().catch(() => null)
            pingSuccess = data ? (data.connected === true || data.status === 'connected') : true
          }
        } catch {}
      }

      if (!active) return

      if (pingSuccess || hasRecentRecord) {
        consecutiveFailures = 0
        setIsOnline(true)
      } else {
        consecutiveFailures++
        if (consecutiveFailures >= 2) {
          setIsOnline(false)
        }
      }
    }

    checkStatus()
    const timer = setInterval(checkStatus, 3000)

    const unsubSessions = onSnapshot(collection(db, 'esp32_sessions'), (snapshot) => {
      if (!active || snapshot.empty) return
      let newestSessionTime = 0
      let isSessionActive = false
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        let t = 0
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          t = data.timestamp.toDate().getTime()
        } else if (data.timestamp && typeof data.timestamp === 'number') {
          t = new Date(data.timestamp).getTime()
        } else if (data.recorded_at) {
          t = new Date(data.recorded_at).getTime()
        }
        if (t > newestSessionTime) {
          newestSessionTime = t
          isSessionActive = data.status === 'online' || data.connected === true || (Date.now() - t < 30000)
        }
      })
      if (newestSessionTime > lastRecordTimestamp) {
        lastRecordTimestamp = newestSessionTime
      }
      if (isSessionActive) {
        consecutiveFailures = 0
        setIsOnline(true)
      }
    })

    const unsubscribe = onSnapshot(collection(db, 'trash_records'), (snapshot) => {
      if (!active) return
      if (snapshot.empty) {
        return
      }
      let newestTime = 0
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        if (deviceIp && data.deviceIp && data.deviceIp !== deviceIp) return
        let t = 0
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          t = data.timestamp.toDate().getTime()
        } else if (data.timestamp && typeof data.timestamp === 'number') {
          t = new Date(data.timestamp).getTime()
        } else if (data.recorded_at) {
          t = new Date(data.recorded_at).getTime()
        } else if (doc._document?.createTime?.timestamp?.toDate) {
          t = doc._document.createTime.timestamp.toDate().getTime()
        } else if (doc._document?.createTime?.toMillis) {
          t = doc._document.createTime.toMillis()
        }
        if (t > newestTime) newestTime = t
      })

      if (newestTime > lastRecordTimestamp) {
        lastRecordTimestamp = newestTime
      }
      const isRecent = newestTime > 0 && (Date.now() - newestTime < 30000)
      if (isRecent) {
        consecutiveFailures = 0
        setIsOnline(true)
      }
    })

    return () => {
      active = false
      clearInterval(timer)
      unsubSessions()
      unsubscribe()
    }
  }, [deviceIp])

  const effectiveOnline = propIsOnline !== undefined ? propIsOnline : isOnline

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings }
  ]

  const handleSelect = (id) => {
    if (onTabChange) {
      onTabChange(id)
    }
    setMobileOpen(false)
  }

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else if (onTabChange) {
      onTabChange('login')
    }
    setMobileOpen(false)
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 text-slate-800 w-64 select-none">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <img src={logo} alt="EcoBin Logo" className="w-16 h-16 object-contain" />
          </div>
          <div>
            <h1 className="text-[20px] font-extrabold tracking-tight text-slate-900 leading-none">
              EcoBin
            </h1>
            <p className="text-[13px] font-medium text-slate-400 mt-1">
              Smart Waste System
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded text-md font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {item.badge && Number(item.badge) > 0 ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive
                        ? 'bg-white text-emerald-700'
                        : 'bg-rose-500 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}

                <ChevronRight
                  className={`w-3.5 h-3.5 transition-transform ${
                    isActive ? 'opacity-90' : 'opacity-0'
                  }`}
                />
              </div>
            </button>
          )
        })}

        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded text-md font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition"
        >
          <LogOut className="w-4 h-4 text-rose-500" />
          <span>Logout</span>
        </button>
      </nav>
    </div>
  )

  return (
    <>
      <div className="md:hidden fixed top-4 left-4 z-40">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-50"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      <aside className="hidden md:block h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 flex-1 max-w-xs w-full shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
