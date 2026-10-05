import React, { useState, useEffect } from 'react'
import { db } from './firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import Dashboard from './components/page/dashboard'
import Login from './components/page/login'
import Esp32OfflineModal from './components/modal/Esp32OfflineModal'

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return localStorage.getItem('ecobin_is_authenticated') === 'true'
    } catch {
      return false
    }
  })
  const [isOffline, setIsOffline] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const getDeviceIp = () => {
    try {
      const saved = localStorage.getItem('ecobin_esp32_ip')
      if (saved) return saved
    } catch {}
    return import.meta.env.VITE_ESP32_IP || '192.168.43.221'
  }

  const [deviceIp, setDeviceIp] = useState(getDeviceIp)

  useEffect(() => {
    let active = true
    let consecutiveFailures = 0
    let lastRecordTimestamp = 0
    let wasOffline = true

    const checkStatus = async () => {
      const currentIp = getDeviceIp()
      if (currentIp !== deviceIp) {
        setDeviceIp(currentIp)
      }

      const hasRecentRecord = lastRecordTimestamp > 0 && (Date.now() - lastRecordTimestamp < 30000)

      let pingSuccess = false

      if (currentIp && currentIp !== '0.0.0.0') {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 2000)
          const res = await fetch(`http://${currentIp}/api/status`, {
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
        if (wasOffline) {
          wasOffline = false
          setIsOffline(false)
        }
      } else {
        consecutiveFailures++
        if (consecutiveFailures >= 2) {
          if (!wasOffline) {
            wasOffline = true
            setDismissed(false)
            setIsOffline(true)
          }
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
        if (wasOffline) {
          wasOffline = false
          setIsOffline(false)
        }
      }
    })

    const unsubscribe = onSnapshot(collection(db, 'trash_records'), (snapshot) => {
      if (!active) return
      if (snapshot.empty) {
        return
      }
      let newestTime = 0
      const currentIp = getDeviceIp()
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        if (currentIp && data.deviceIp && data.deviceIp !== currentIp) return
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
        if (wasOffline) {
          wasOffline = false
          setIsOffline(false)
        }
      }
    })

    return () => {
      active = false
      clearInterval(timer)
      unsubSessions()
      unsubscribe()
    }
  }, [deviceIp])

  const handleClose = () => {
    setDismissed(true)
  }

  const handleRetry = () => {
    setDismissed(false)
    setIsOffline(false)
  }

  const handleLogout = () => {
    try {
      localStorage.removeItem('ecobin_is_authenticated')
      localStorage.removeItem('ecobin_auth_user')
    } catch {}
    setIsAuthenticated(false)
  }

  const handleLogin = (user) => {
    try {
      localStorage.setItem('ecobin_is_authenticated', 'true')
      if (user) {
        localStorage.setItem('ecobin_auth_user', JSON.stringify(user))
      }
    } catch {}
    setIsAuthenticated(true)
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <>
      <Dashboard
        isOffline={isOffline}
        isOnline={!isOffline}
        onLogout={handleLogout}
      />
      <Esp32OfflineModal
        isOpen={isOffline && !dismissed}
        onClose={handleClose}
        onRetry={handleRetry}
        deviceIp={deviceIp}
      />
    </>
  )
}
