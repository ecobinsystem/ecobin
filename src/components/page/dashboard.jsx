import React, { useState, useEffect, useRef } from 'react'
import { db } from '../../firebase'
import { collection, onSnapshot, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import Sidebar from './sidebar'
import Notifications from './notifications'
import Reports from './reports'
import Settings from './settings'
import Login from './login'
import { notifyRecipientsViaPushbullet } from '../../services/pushbullet'
import {
  Trash2,
  Recycle,
  Leaf,
  AlertTriangle,
  Activity,
  RefreshCw
} from 'lucide-react'

export default function Dashboard({ isOffline: propIsOffline, isOnline: propIsOnline, onLogout: propOnLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [readings, setReadings] = useState([])
  const [latestData, setLatestData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const lastNotifiedRef = useRef({
    Biodegradable: 0,
    Recyclable: 0,
    Residual: 0
  })

  const isRecent = latestData?.rawDate ? (Date.now() - latestData.rawDate.getTime() < 45000) : false
  const isOffline = propIsOffline !== undefined ? propIsOffline : (propIsOnline !== undefined ? !propIsOnline : !isRecent)
  const isOfflineRef = useRef(isOffline)

  useEffect(() => {
    isOfflineRef.current = isOffline
  }, [isOffline])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'notifications'),
      (snapshot) => {
        if (snapshot.empty) return
        snapshot.docs.forEach((doc) => {
          const d = doc.data()
          const binName = d.binName
          if (binName) {
            let time = 0
            if (d.createdAt && typeof d.createdAt.toDate === 'function') {
              time = d.createdAt.toDate().getTime()
            } else if (d.createdAt && typeof d.createdAt.toMillis === 'function') {
              time = d.createdAt.toMillis()
            } else if (d.timestamp) {
              time = new Date(d.timestamp).getTime()
            } else if (doc._document?.createTime?.timestamp?.toDate) {
              time = doc._document.createTime.timestamp.toDate().getTime()
            } else if (doc._document?.createTime?.toMillis) {
              time = doc._document.createTime.toMillis()
            }
            if (time > (lastNotifiedRef.current[binName] || 0)) {
              lastNotifiedRef.current[binName] = time
            }
          }
        })
      },
      (err) => {
        console.error(err)
      }
    )

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'trash_records'),
      (snapshot) => {
        setConnected(true)
        setLoading(false)

        if (snapshot.empty) {
          setLatestData(null)
          setReadings([])
          return
        }

        const docs = snapshot.docs.map((doc) => {
          const data = doc.data()
          let dateObj = null
          if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            dateObj = data.timestamp.toDate()
          } else if (data.timestamp && typeof data.timestamp === 'number') {
            dateObj = new Date(data.timestamp)
          } else if (data.recorded_at) {
            dateObj = new Date(data.recorded_at)
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
            timeStr: dateObj.toLocaleTimeString(),
            dateStr: dateObj.toLocaleDateString(),
            ...data
          }
        })

        docs.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime())

        setReadings(docs)
        if (docs.length > 0) {
          const newest = docs[0]
          setLatestData(newest)
          setLastUpdated(new Date().toLocaleTimeString())

          const isRecordRecent = newest?.rawDate ? (Date.now() - newest.rawDate.getTime() < 45000) : false
          const isEsp32Offline = isOfflineRef.current || !isRecordRecent || (propIsOffline !== undefined && propIsOffline) || (propIsOnline !== undefined && !propIsOnline)

          if (isEsp32Offline) {
            return
          }

          const checkBins = [
            {
              name: 'Biodegradable',
              data: newest.biodegradable,
              fill: Math.min(100, Math.max(0, Math.round(Number(newest.biodegradable?.fillPercentage) || 0))),
              distance: newest.biodegradable?.distanceCm != null ? Number(newest.biodegradable.distanceCm).toFixed(1) : '--'
            },
            {
              name: 'Recyclable',
              data: newest.recyclable,
              fill: Math.min(100, Math.max(0, Math.round(Number(newest.recyclable?.fillPercentage) || 0))),
              distance: newest.recyclable?.distanceCm != null ? Number(newest.recyclable.distanceCm).toFixed(1) : '--'
            },
            {
              name: 'Residual',
              data: newest.residual,
              fill: Math.min(100, Math.max(0, Math.round(Number(newest.residual?.fillPercentage) || 0))),
              distance: newest.residual?.distanceCm != null ? Number(newest.residual.distanceCm).toFixed(1) : '--'
            }
          ]

          checkBins.forEach((b) => {
            const isEligible = b.fill >= 80 || b.data?.status === 'FULL' || b.data?.status === 'NEARLY_FULL' || b.data?.status === 'NEARLY FULL' || b.data?.status === 'WARNING'
            if (isEligible) {
              const now = Date.now()
              const lastTime = Number(lastNotifiedRef.current[b.name]) || 0

              if (now - lastTime >= 5 * 60 * 1000) {
                lastNotifiedRef.current[b.name] = now
                let localRecipients = []
                try {
                  const saved = localStorage.getItem('ecobin_recipients')
                  if (saved) localRecipients = JSON.parse(saved)
                } catch {}

                getDocs(collection(db, 'recipients')).then((recipSnap) => {
                  let recipList = recipSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
                  if (!recipList || recipList.length === 0) {
                    recipList = localRecipients
                  } else if (localRecipients.length > 0) {
                    const combined = [...recipList]
                    localRecipients.forEach((lr) => {
                      const lrPhone = (lr.contact || lr.contactNumber || lr.phone || '').trim()
                      if (!combined.some((c) => {
                        const cPhone = (c.contact || c.contactNumber || c.phone || '').trim()
                        return (c.id && c.id === lr.id) || (c.name && c.name === lr.name) || (lrPhone && cPhone && cPhone === lrPhone)
                      })) {
                        combined.push(lr)
                      }
                    })
                    recipList = combined
                  }

                  const currentStatus = (b.fill >= 100 || b.data?.status === 'FULL') ? 'FULL' : ((b.fill >= 90 || b.data?.status === 'NEARLY_FULL' || b.data?.status === 'NEARLY FULL') ? 'NEARLY FULL' : 'WARNING')
                  const recipientNames = recipList.map((r) => r.name || r.recipientName).filter(Boolean).join(', ')
                  const recipientContacts = recipList.map((r) => r.contact || r.phone).filter(Boolean).join(', ')

                  addDoc(collection(db, 'notifications'), {
                    binName: b.name,
                    fillPercentage: b.fill,
                    distanceCm: b.distance,
                    status: currentStatus,
                    recipientName: recipientNames || 'All Recipients',
                    recipientContact: recipientContacts || '',
                    recipients: recipList.map((r) => ({
                      name: r.name || r.recipientName || '',
                      contact: r.contact || r.phone || ''
                    })),
                    deviceIp: newest.deviceIp || '192.168.43.221',
                    createdAt: serverTimestamp(),
                    timestampStr: new Date().toLocaleTimeString(),
                    dateStr: new Date().toLocaleDateString()
                  }).catch(() => null)

                  notifyRecipientsViaPushbullet({
                    binName: b.name,
                    fillPercentage: b.fill,
                    distanceCm: b.distance,
                    status: currentStatus
                  }, recipList)
                }).catch(() => {
                  const currentStatus = (b.fill >= 100 || b.data?.status === 'FULL') ? 'FULL' : ((b.fill >= 90 || b.data?.status === 'NEARLY_FULL' || b.data?.status === 'NEARLY FULL') ? 'NEARLY FULL' : 'WARNING')
                  const recipientNames = localRecipients.map((r) => r.name || r.recipientName).filter(Boolean).join(', ')
                  const recipientContacts = localRecipients.map((r) => r.contact || r.phone).filter(Boolean).join(', ')

                  addDoc(collection(db, 'notifications'), {
                    binName: b.name,
                    fillPercentage: b.fill,
                    distanceCm: b.distance,
                    status: currentStatus,
                    recipientName: recipientNames || 'All Recipients',
                    recipientContact: recipientContacts || '',
                    recipients: localRecipients.map((r) => ({
                      name: r.name || r.recipientName || '',
                      contact: r.contact || r.phone || ''
                    })),
                    deviceIp: newest.deviceIp || '192.168.43.221',
                    createdAt: serverTimestamp(),
                    timestampStr: new Date().toLocaleTimeString(),
                    dateStr: new Date().toLocaleDateString()
                  }).catch(() => null)

                  notifyRecipientsViaPushbullet({
                    binName: b.name,
                    fillPercentage: b.fill,
                    distanceCm: b.distance,
                    status: currentStatus
                  }, localRecipients)
                })
              }
            }
          })
        }
      },
      (err) => {
        console.error(err)
        setConnected(false)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const bio = latestData?.biodegradable || {
    distanceCm: null,
    fillPercentage: 0,
    status: 'NO DATA'
  }
  const rec = latestData?.recyclable || {
    distanceCm: null,
    fillPercentage: 0,
    status: 'NO DATA'
  }
  const res = latestData?.residual || {
    distanceCm: null,
    fillPercentage: 0,
    status: 'NO DATA'
  }

  const getStatusBadge = (pct, status) => {
    const p = Number(pct) || 0
    if (p >= 100 || status === 'FULL') {
      return {
        label: 'FULL',
        bg: 'bg-rose-100 text-rose-800 border-rose-200',
        bar: 'bg-rose-500',
        cardBorder: 'border-rose-300 shadow-rose-50'
      }
    }
    if (p >= 90 || status === 'NEARLY_FULL' || status === 'NEARLY FULL') {
      return {
        label: 'NEARLY FULL',
        bg: 'bg-orange-100 text-orange-800 border-orange-200',
        bar: 'bg-orange-500',
        cardBorder: 'border-orange-300 shadow-orange-50'
      }
    }
    if (p >= 80 || status === 'WARNING') {
      return {
        label: 'WARNING',
        bg: 'bg-amber-100 text-amber-800 border-amber-200',
        bar: 'bg-amber-500',
        cardBorder: 'border-amber-300 shadow-amber-50'
      }
    }
    return {
      label: 'NORMAL',
      bg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      bar: 'bg-emerald-500',
      cardBorder: 'border-emerald-200 shadow-emerald-50'
    }
  }

  const bins = [
    {
      name: 'Biodegradable',
      icon: Leaf,
      iconColor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      accent: 'emerald',
      accentColor: '#10b981',
      accentDark: '#047857',
      accentGradient: 'bg-gradient-to-t from-emerald-600 to-emerald-400',
      data: bio,
      fill: Math.min(100, Math.max(0, Math.round(Number(bio.fillPercentage) || 0))),
      distance: bio.distanceCm != null ? Number(bio.distanceCm).toFixed(1) : '--'
    },
    {
      name: 'Recyclable',
      icon: Recycle,
      iconColor: 'text-blue-600 bg-blue-50 border-blue-200',
      accent: 'blue',
      accentColor: '#3b82f6',
      accentDark: '#1d4ed8',
      accentGradient: 'bg-gradient-to-t from-blue-600 to-blue-400',
      data: rec,
      fill: Math.min(100, Math.max(0, Math.round(Number(rec.fillPercentage) || 0))),
      distance: rec.distanceCm != null ? Number(rec.distanceCm).toFixed(1) : '--'
    },
    {
      name: 'Residual',
      icon: Trash2,
      iconColor: 'text-purple-600 bg-purple-50 border-purple-200',
      accent: 'purple',
      accentColor: '#8b5cf6',
      accentDark: '#6d28d9',
      accentGradient: 'bg-gradient-to-t from-purple-600 to-purple-400',
      data: res,
      fill: Math.min(100, Math.max(0, Math.round(Number(res.fillPercentage) || 0))),
      distance: res.distanceCm != null ? Number(res.distanceCm).toFixed(1) : '--'
    }
  ]
  const handleLogout = () => {
    if (propOnLogout) {
      propOnLogout()
    } else {
      setActiveTab('login')
    }
  }

  if (activeTab === 'login') {
    return (
      <Login
        onLogin={() => {
          if (propOnLogout) {
            propOnLogout()
          }
          setActiveTab('dashboard')
        }}
      />
    )
  }

  if (activeTab === 'notifications') {
    return (
      <Notifications
        isOffline={isOffline}
        isOnline={!isOffline}
        onTabChange={setActiveTab}
        deviceIp={latestData?.deviceIp}
        onLogout={handleLogout}
      />
    )
  }

  if (activeTab === 'reports') {
    return (
      <Reports
        isOffline={isOffline}
        isOnline={!isOffline}
        onTabChange={setActiveTab}
        deviceIp={latestData?.deviceIp}
        onLogout={handleLogout}
      />
    )
  }

  if (activeTab === 'settings') {
    return (
      <Settings
        isOffline={isOffline}
        isOnline={!isOffline}
        onTabChange={setActiveTab}
        deviceIp={latestData?.deviceIp}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        deviceIp={latestData?.deviceIp || '192.168.43.221'}
        isOnline={!isOffline}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 py-8 px-4 sm:px-8 overflow-y-auto">
        <main className="w-full max-w-5xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Bin Level Monitoring
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Live tracking of fill levels across all 3 waste compartments
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                !isOffline
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  !isOffline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span>{!isOffline ? 'Device Online' : 'Device Offline'}</span>
            </div>

            {lastUpdated && (
              <span className="text-xs text-slate-500 font-mono hidden md:inline">
                Synced: {lastUpdated}
              </span>
            )}
          </div>
        </header>

        {loading || isOffline ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-sm">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <div className="text-base font-semibold text-slate-900">
              Connecting to EcoBin Device...
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Awaiting data from EcoBin sensors
            </p>
          </div>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {bins.map((bin, index) => {
              const Icon = bin.icon
              const badge = getStatusBadge(bin.fill, bin.data.status)

              return (
                <div
                  key={index}
                  className={`bg-white rounded-2xl border p-5 shadow-sm transition hover:shadow-md flex flex-col justify-between ${badge.cardBorder}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center border ${bin.iconColor}`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-900 leading-tight">
                            {bin.name}
                          </h2>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-full border ${badge.bg}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex flex-col items-center justify-center my-2.5 p-4 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="relative w-36 h-44 flex flex-col items-center select-none">
                        <div className="w-10 h-3 rounded-t-md bg-slate-700 shadow-sm flex items-center justify-center z-20">
                          <div className="w-6 h-1 rounded-full bg-slate-500" />
                        </div>

                        <div
                          className="w-32 h-4 rounded-t-md shadow-sm z-20 -mt-0.5 flex items-center justify-center"
                          style={{ backgroundColor: bin.accentColor }}
                        >
                          <div className="w-24 h-0.5 rounded-full bg-white/40" />
                        </div>

                        <div
                          className="w-34 h-2 rounded-sm shadow-sm z-20 -mt-0.5"
                          style={{ backgroundColor: bin.accentDark }}
                        />

                        <div
                          className="relative w-28 h-32 -mt-0.5 bg-white rounded-b-xl border-2 border-slate-300 shadow-inner overflow-hidden flex flex-col justify-end"
                          style={{
                            clipPath: 'polygon(0% 0%, 100% 0%, 88% 100%, 12% 100%)'
                          }}
                        >
                          <div
                            className={`w-full transition-all duration-700 ease-out relative flex items-start justify-center ${
                              bin.fill >= 90
                                ? 'bg-gradient-to-t from-rose-600 to-rose-400'
                                : bin.fill >= 50
                                ? 'bg-gradient-to-t from-amber-500 to-amber-400'
                                : bin.accentGradient
                            }`}
                            style={{ height: `${bin.fill}%` }}
                          >
                            <div className="w-full h-1 bg-white/50 shadow-sm" />
                          </div>

                          <div className="absolute inset-0 flex justify-evenly pointer-events-none px-4 py-2 z-10">
                            <div className="w-1 h-full bg-slate-400/20 rounded-full" />
                            <div className="w-1 h-full bg-slate-400/20 rounded-full" />
                            <div className="w-1 h-full bg-slate-400/20 rounded-full" />
                          </div>

                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 opacity-20">
                            <Icon className="w-12 h-12 text-slate-800" />
                          </div>

                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20">
                            <span className="text-2xl font-black font-mono tracking-tight text-slate-900 bg-white/80 px-2.5 py-0.5 rounded-md border border-slate-200/60 shadow-sm backdrop-blur-[2px]">
                              {bin.fill}%
                            </span>
                          </div>
                        </div>

                        <div className="w-20 h-2 bg-slate-600 rounded-full mt-1 shadow-sm opacity-70" />
                      </div>

                    </div>
                  </div>

                  {bin.fill >= 90 && (
                    <div className="mt-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Compartment is near full capacity. Please empty.</span>
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )}
      </main>
    </div>
  </div>
  )
}
