import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import Sidebar from './sidebar'
import RecipientsModal from '../modal/RecipientsModal'
import {
  Bell,
  Trash2,
  Recycle,
  Leaf,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Clock,
  Radio,
  Inbox,
  Users,
  Search,
  X
} from 'lucide-react'

export default function Notifications({
  isOffline: propIsOffline,
  isOnline: propIsOnline,
  onTabChange,
  deviceIp: propDeviceIp,
  onLogout
}) {
  const [activeTab, setActiveTab] = useState('notifications')
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRecipientsOpen, setIsRecipientsOpen] = useState(false)
  const [recipientsList, setRecipientsList] = useState(() => {
    try {
      const saved = localStorage.getItem('ecobin_recipients')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCompartment, setSelectedCompartment] = useState('all')

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'recipients'), (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map((doc) => doc.data())
        setRecipientsList(list)
      }
    })
    return () => unsub()
  }, [])

  const effectiveDeviceIp = propDeviceIp || import.meta.env.VITE_ESP32_IP || '192.168.43.221'

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'notifications'),
      (snapshot) => {
        setConnected(true)
        setLoading(false)

        if (snapshot.empty) {
          setNotifications([])
          return
        }

        const docs = snapshot.docs.map((doc) => {
          const data = doc.data()
          let dateObj = null
          if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            dateObj = data.createdAt.toDate()
          } else if (data.timestamp) {
            dateObj = new Date(data.timestamp)
          } else if (doc._document?.createTime?.timestamp?.toDate) {
            dateObj = doc._document.createTime.timestamp.toDate()
          } else if (doc._document?.createTime?.toMillis) {
            dateObj = new Date(doc._document.createTime.toMillis())
          } else {
            dateObj = new Date(0)
          }

          return {
            id: doc.id,
            rawDate: dateObj,
            timeDisplay: dateObj.getTime() > 0 ? dateObj.toLocaleTimeString() : (data.timestampStr || '--'),
            dateDisplay: dateObj.getTime() > 0 ? dateObj.toLocaleDateString() : (data.dateStr || '--'),
            ...data
          }
        })

        docs.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())

        setNotifications(docs)
        setLastUpdated(new Date().toLocaleTimeString())
      },
      (err) => {
        console.error(err)
        setConnected(false)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  function getBinConfig(name) {
    const n = String(name || '').toLowerCase()
    if (n.includes('bio')) {
      return {
        icon: Leaf,
        iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        barBg: 'bg-emerald-500'
      }
    }
    if (n.includes('rec')) {
      return {
        icon: Recycle,
        iconBg: 'bg-blue-50 text-blue-600 border-blue-200',
        barBg: 'bg-blue-500'
      }
    }
    return {
      icon: Trash2,
      iconBg: 'bg-purple-50 text-purple-600 border-purple-200',
      barBg: 'bg-purple-500'
    }
  }

  function getStatusBadge(status) {
    const s = String(status || '').toUpperCase()
    if (s.includes('FULL') && !s.includes('HALF') && !s.includes('NEARLY')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
          <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
          {status}
        </span>
      )
    }
    if (s.includes('NEARLY')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
          <AlertTriangle className="w-3 h-3 text-orange-600 shrink-0" />
          {status}
        </span>
      )
    }
    if (s.includes('HALF') || s.includes('WARNING')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
          {status}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
        <Clock className="w-3 h-3 text-slate-500 shrink-0" />
        {status || 'NORMAL'}
      </span>
    )
  }

  function getRecipientsList(item) {
    if (item.recipients && Array.isArray(item.recipients) && item.recipients.length > 0) {
      return item.recipients.map((r) => ({
        name: r.name || r.recipientName || 'Recipient',
        contact: r.contact || r.phone || ''
      }))
    }
    if (item.recipient && typeof item.recipient === 'object') {
      return [{
        name: item.recipient.name || 'Recipient',
        contact: item.recipient.contact || item.recipient.phone || ''
      }]
    }
    if (item.recipientName || item.recipientContact) {
      const names = String(item.recipientName || '').split(',').map((s) => s.trim()).filter(Boolean)
      const contacts = String(item.recipientContact || '').split(',').map((s) => s.trim()).filter(Boolean)
      if (names.length > 0) {
        return names.map((name, idx) => ({
          name,
          contact: contacts[idx] || ''
        }))
      }
    }
    if (recipientsList && recipientsList.length > 0) {
      return recipientsList.map((r) => ({
        name: r.name || r.recipientName || 'Recipient',
        contact: r.contact || r.phone || ''
      }))
    }
    return []
  }

  const compartmentOptions = [
    { id: 'all', label: 'All' },
    { id: 'biodegradable', label: 'Biodegradable', icon: Leaf },
    { id: 'recyclable', label: 'Recyclable', icon: Recycle },
    { id: 'residual', label: 'Residual', icon: Trash2 }
  ]

  function getCompartmentCount(compId) {
    if (compId === 'all') return notifications.length
    return notifications.filter((item) =>
      String(item.binName || '').toLowerCase().includes(compId)
    ).length
  }

  const filteredNotifications = notifications.filter((item) => {
    if (selectedCompartment !== 'all') {
      const bName = String(item.binName || '').toLowerCase()
      if (!bName.includes(selectedCompartment.toLowerCase())) {
        return false
      }
    }
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const binMatch = String(item.binName || '').toLowerCase().includes(q)
    const statusMatch = String(item.status || '').toLowerCase().includes(q)
    const timeMatch = String(item.timeDisplay || item.timestampStr || '').toLowerCase().includes(q)
    const dateMatch = String(item.dateDisplay || item.dateStr || '').toLowerCase().includes(q)
    const recipList = getRecipientsList(item)
    const recipMatch = recipList.some(
      (r) => r.name.toLowerCase().includes(q) || r.contact.toLowerCase().includes(q)
    )
    return binMatch || statusMatch || timeMatch || dateMatch || recipMatch
  })

  function handleTabNavigation(id) {
    setActiveTab(id)
    if (onTabChange) {
      onTabChange(id)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabNavigation}
        deviceIp={effectiveDeviceIp}
        isOnline={propIsOnline !== undefined ? propIsOnline : !propIsOffline}
        onLogout={onLogout}
      />

      <div className="flex-1 min-w-0 py-8 px-4 sm:px-8 overflow-y-auto">
        <main className="w-full max-w-5xl mx-auto flex flex-col gap-6">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  Trash Bin Notifications
                </h1>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Real-time log of half-full and full capacity alerts.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsRecipientsOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded text-xs font-semibold bg-emerald-600 border border-slate-500 text-white hover:bg-emerald-700 hover:border-slate-400 shadow-sm transition"
              >
                <Users className="w-5 h-5 text-white" />
                <span className='text-[15px]'>Recipients</span>
              </button>

              {lastUpdated && (
                <span className="text-xs text-slate-500 font-mono hidden md:inline">
                  Synced: {lastUpdated}
                </span>
              )}
            </div>
          </header>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notifications..."
                  className="w-full pl-9 pr-8 py-2 text-sm rounded border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white transition shadow-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 p-1 text-slate-400 hover:text-slate-600 rounded"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                {compartmentOptions.map((opt) => {
                  const Icon = opt.icon
                  const isSelected = selectedCompartment === opt.id
                  const count = getCompartmentCount(opt.id)

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedCompartment(opt.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition border whitespace-nowrap ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      <span>{opt.label}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          isSelected
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {loading ? (
              <div className="p-12 text-center">
                <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-6 h-6" />
                </div>
                <div className="text-base font-semibold text-slate-800">
                  No notifications yet
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  When ultrasonic sensors detect that a trash bin has reached half-full (≥50%), the alert will automatically appear here.
                </p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-6 h-6" />
                </div>
                <div className="text-base font-semibold text-slate-800">
                  No notifications match your filters
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Try adjusting your search query or selecting a different compartment.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedCompartment('all')
                  }}
                  className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition shadow-xs"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reset Filters</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[14px] font-bold tracking-wider text-slate-500">
                      <th className="py-3 px-5">Trash Bin</th>
                      <th className="py-3 px-4">Fill Percentage</th>
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-5 text-right">Notified Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                    {filteredNotifications.map((item) => {
                      const binCfg = getBinConfig(item.binName)
                      const Icon = binCfg.icon
                      const fillPct = Math.min(100, Math.max(0, Math.round(Number(item.fillPercentage) || 0)))
                      const isFull = fillPct >= 100 || String(item.status || '').toUpperCase() === 'FULL'
                      const isNearlyFull = (fillPct >= 90 && fillPct < 100) || String(item.status || '').toUpperCase().includes('NEARLY')

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/60 transition-colors ${
                            isFull ? 'bg-rose-50/30' : (isNearlyFull ? 'bg-orange-50/20' : '')
                          }`}
                        >
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-sm ${binCfg.iconBg}`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-sm">
                                  {item.binName || 'Trash Bin'}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 w-48">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center justify-between font-mono font-bold text-xs">
                                <span className={isFull ? 'text-rose-600' : (isNearlyFull ? 'text-orange-600' : 'text-amber-600')}>
                                  {fillPct}%
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isFull
                                      ? 'bg-gradient-to-r from-rose-500 to-red-600'
                                      : (isNearlyFull ? 'bg-gradient-to-r from-orange-400 to-orange-500' : 'bg-gradient-to-r from-amber-400 to-amber-500')
                                  }`}
                                  style={{ width: `${fillPct}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <div className="flex flex-col gap-2.5">
                              {getRecipientsList(item).map((recip, idx) => (
                                <div key={idx} className="flex flex-col leading-tight">
                                  <span className="font-semibold text-slate-900 text-xs">
                                    {recip.name}
                                  </span>
                                  {recip.contact && (
                                    <span className="font-mono text-[11px] text-slate-500 mt-0.5">
                                      {recip.contact}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {getRecipientsList(item).length === 0 && (
                                <span className="text-xs text-slate-400">
                                  --
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            {getStatusBadge(item.status)}
                          </td>

                          <td className="py-4 px-5 text-right">
                            <div className="font-mono text-xs font-semibold text-slate-700">
                              {item.timeDisplay}
                            </div>
                            <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                              {item.dateDisplay}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </div>

      <RecipientsModal
        isOpen={isRecipientsOpen}
        onClose={() => setIsRecipientsOpen(false)}
      />
    </div>
  )
}
