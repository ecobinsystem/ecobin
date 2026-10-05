import React, { useState, useEffect, useMemo, useDeferredValue } from 'react'
import { db } from '../../firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import Sidebar from './sidebar'
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Search,
  Printer,
  Filter,
  Leaf,
  Recycle,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Layers,
  ArrowUpRight,
  Sparkles,
  RotateCcw,
  X,
  FileSpreadsheet,
  Clock,
  Cpu
} from 'lucide-react'

export default function Reports({
  isOffline: propIsOffline,
  isOnline: propIsOnline,
  onTabChange,
  deviceIp: propDeviceIp,
  onLogout
}) {
  const [activeTab, setActiveTab] = useState('reports')
  const [wasteRecords, setWasteRecords] = useState([])
  const [trashRecords, setTrashRecords] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearchQuery = useDeferredValue(searchQuery)
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [selectedYear, setSelectedYear] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 12

  const effectiveDeviceIp = propDeviceIp || import.meta.env.VITE_ESP32_IP || '192.168.43.221'

  const extractDate = (doc, data) => {
    if (data?.timestamp && typeof data.timestamp.toDate === 'function') return data.timestamp.toDate()
    if (data?.timestamp && typeof data.timestamp === 'number') return new Date(data.timestamp)
    if (data?.createdAt && typeof data.createdAt.toDate === 'function') return data.createdAt.toDate()
    if (data?.createdAt && typeof data.createdAt === 'number') return new Date(data.createdAt)
    if (data?.recorded_at) return new Date(data.recorded_at)
    if (doc?._document?.createTime?.timestamp?.toDate) return doc._document.createTime.timestamp.toDate()
    if (doc?._document?.createTime?.toMillis) return new Date(doc._document.createTime.toMillis())
    return new Date()
  }

  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const formatDateTime = (date) => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '--'
    const month = MONTHS_SHORT[date.getMonth()] || ''
    const day = date.getDate()
    const year = date.getFullYear()
    let hours = date.getHours()
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours ? hours : 12
    return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`
  }

  useEffect(() => {
    let unsubs = []

    const unsubWaste = onSnapshot(
      collection(db, 'waste_records'),
      (snapshot) => {
        const items = snapshot.docs.map((doc) => {
          const d = doc.data()
          const dt = extractDate(doc, d)
          const cat = (d.waste_type || d.Classification || 'residual').toLowerCase()
          return {
            id: doc.id,
            sourceType: 'classification',
            category: cat,
            label: cat.charAt(0).toUpperCase() + cat.slice(1),
            confidence: typeof d.confidence === 'number' ? d.confidence : null,
            accepted: d.accepted !== undefined ? d.accepted : true,
            status: d.accepted === false ? 'REJECTED' : 'CONFIRMED',
            date: dt,
            dateStr: dt.toLocaleDateString(),
            timeStr: dt.toLocaleTimeString(),
            raw: d
          }
        })
        setWasteRecords(items)
        setLoading(false)
        setLastRefreshed(new Date().toLocaleTimeString())
      },
      () => setLoading(false)
    )
    unsubs.push(unsubWaste)

    const unsubTrash = onSnapshot(
      collection(db, 'trash_records'),
      (snapshot) => {
        const items = snapshot.docs.map((doc) => {
          const d = doc.data()
          const dt = extractDate(doc, d)
          return {
            id: doc.id,
            sourceType: 'telemetry',
            date: dt,
            dateStr: dt.toLocaleDateString(),
            timeStr: dt.toLocaleTimeString(),
            deviceIp: d.deviceIp || effectiveDeviceIp,
            bioFill: Number(d.biodegradable?.fillPercentage) || 0,
            bioDist: Number(d.biodegradable?.distanceCm) || 0,
            bioStatus: d.biodegradable?.status || 'LOW',
            recFill: Number(d.recyclable?.fillPercentage) || 0,
            recDist: Number(d.recyclable?.distanceCm) || 0,
            recStatus: d.recyclable?.status || 'LOW',
            resFill: Number(d.residual?.fillPercentage) || 0,
            resDist: Number(d.residual?.distanceCm) || 0,
            resStatus: d.residual?.status || 'LOW',
            raw: d
          }
        })
        setTrashRecords(items)
        setLastRefreshed(new Date().toLocaleTimeString())
      },
      () => {}
    )
    unsubs.push(unsubTrash)

    const unsubNotifications = onSnapshot(
      collection(db, 'notifications'),
      (snapshot) => {
        const items = snapshot.docs.map((doc) => {
          const d = doc.data()
          const dt = extractDate(doc, d)
          const bName = (d.binName || 'General').toLowerCase()
          return {
            id: doc.id,
            sourceType: 'alert',
            category: bName,
            label: bName.charAt(0).toUpperCase() + bName.slice(1),
            fillPercentage: Number(d.fillPercentage) || 0,
            status: d.status || 'FULL',
            recipientName: d.recipientName || 'All Recipients',
            date: dt,
            dateStr: dt.toLocaleDateString(),
            timeStr: dt.toLocaleTimeString(),
            raw: d
          }
        })
        setNotifications(items)
      },
      () => {}
    )
    unsubs.push(unsubNotifications)

    return () => {
      unsubs.forEach((u) => u())
    }
  }, [effectiveDeviceIp])

  const unifiedEntries = useMemo(() => {
    const list = []

    wasteRecords.forEach((w) => {
      const metric = w.confidence !== null ? `${(w.confidence * 100).toFixed(1)}% confidence` : '--'
      const formattedDate = formatDateTime(w.date)
      list.push({
        id: `waste-${w.id}`,
        type: 'AI Classification',
        category: w.category,
        label: w.label,
        metric,
        status: w.status,
        statusType: w.accepted ? 'success' : 'neutral',
        date: w.date,
        dateStr: w.dateStr,
        timeStr: w.timeStr,
        formattedDate,
        source: 'Vision AI',
        searchTarget: `${w.category} ${w.label} ai classification ${metric} ${w.status} vision ai ${formattedDate} ${w.dateStr} ${w.timeStr}`.toLowerCase()
      })
    })

    trashRecords.forEach((t) => {
      const formattedDate = formatDateTime(t.date)
      const bioMetric = `${Math.round(t.bioFill)}% full`
      const recMetric = `${Math.round(t.recFill)}% full`
      const resMetric = `${Math.round(t.resFill)}% full`
      const source = `ESP32 (${t.deviceIp})`

      list.push({
        id: `trash-bio-${t.id}`,
        type: 'Sensor Level',
        category: 'biodegradable',
        label: 'Biodegradable',
        metric: bioMetric,
        status: t.bioStatus,
        statusType: t.bioFill >= 85 ? 'danger' : t.bioFill >= 50 ? 'warning' : 'info',
        date: t.date,
        dateStr: t.dateStr,
        timeStr: t.timeStr,
        formattedDate,
        source,
        searchTarget: `biodegradable sensor level ${bioMetric} ${t.bioStatus} ${source} ${formattedDate} ${t.dateStr} ${t.timeStr}`.toLowerCase()
      })
      list.push({
        id: `trash-rec-${t.id}`,
        type: 'Sensor Level',
        category: 'recyclable',
        label: 'Recyclable',
        metric: recMetric,
        status: t.recStatus,
        statusType: t.recFill >= 85 ? 'danger' : t.recFill >= 50 ? 'warning' : 'info',
        date: t.date,
        dateStr: t.dateStr,
        timeStr: t.timeStr,
        formattedDate,
        source,
        searchTarget: `recyclable sensor level ${recMetric} ${t.recStatus} ${source} ${formattedDate} ${t.dateStr} ${t.timeStr}`.toLowerCase()
      })
      list.push({
        id: `trash-res-${t.id}`,
        type: 'Sensor Level',
        category: 'residual',
        label: 'Residual',
        metric: resMetric,
        status: t.resStatus,
        statusType: t.resFill >= 85 ? 'danger' : t.resFill >= 50 ? 'warning' : 'info',
        date: t.date,
        dateStr: t.dateStr,
        timeStr: t.timeStr,
        formattedDate,
        source,
        searchTarget: `residual sensor level ${resMetric} ${t.resStatus} ${source} ${formattedDate} ${t.dateStr} ${t.timeStr}`.toLowerCase()
      })
    })

    notifications.forEach((n) => {
      const metric = `${n.fillPercentage}% capacity`
      const formattedDate = formatDateTime(n.date)
      const source = `Alert to ${n.recipientName}`
      list.push({
        id: `notif-${n.id}`,
        type: 'System Alert',
        category: n.category,
        label: n.label,
        metric,
        status: n.status,
        statusType: 'danger',
        date: n.date,
        dateStr: n.dateStr,
        timeStr: n.timeStr,
        formattedDate,
        source,
        searchTarget: `${n.category} ${n.label} system alert ${metric} ${n.status} ${source} ${formattedDate} ${n.dateStr} ${n.timeStr}`.toLowerCase()
      })
    })

    return list.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [wasteRecords, trashRecords, notifications])

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const yearsSet = new Set([currentYear])
    unifiedEntries.forEach((e) => {
      if (e.date && !isNaN(e.date.getFullYear())) {
        yearsSet.add(e.date.getFullYear())
      }
    })
    return Array.from(yearsSet).sort((a, b) => b - a)
  }, [unifiedEntries])

  const monthsList = [
    { value: '0', label: 'January' },
    { value: '1', label: 'February' },
    { value: '2', label: 'March' },
    { value: '3', label: 'April' },
    { value: '4', label: 'May' },
    { value: '5', label: 'June' },
    { value: '6', label: 'July' },
    { value: '7', label: 'August' },
    { value: '8', label: 'September' },
    { value: '9', label: 'October' },
    { value: '10', label: 'November' },
    { value: '11', label: 'December' }
  ]

  const filteredEntries = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase()
    return unifiedEntries.filter((item) => {
      if (selectedYear !== 'all') {
        if (item.date.getFullYear().toString() !== selectedYear) {
          return false
        }
      }

      if (selectedMonth !== 'all') {
        if (item.date.getMonth().toString() !== selectedMonth) {
          return false
        }
      }

      if (q && !item.searchTarget.includes(q)) {
        return false
      }

      return true
    })
  }, [unifiedEntries, selectedYear, selectedMonth, deferredSearchQuery])

  const stats = useMemo(() => {
    const totalClassifications = wasteRecords.filter((w) => {
      if (selectedYear !== 'all' && w.date.getFullYear().toString() !== selectedYear) return false
      if (selectedMonth !== 'all' && w.date.getMonth().toString() !== selectedMonth) return false
      return true
    })

    let bioCount = 0
    let recCount = 0
    let resCount = 0
    let totalConfidenceSum = 0
    let confidenceSamples = 0

    totalClassifications.forEach((w) => {
      if (w.category.includes('bio')) bioCount++
      else if (w.category.includes('rec')) recCount++
      else resCount++

      if (typeof w.confidence === 'number' && !isNaN(w.confidence)) {
        totalConfidenceSum += w.confidence
        confidenceSamples++
      }
    })

    const totalWasteCount = bioCount + recCount + resCount
    const bioPct = totalWasteCount > 0 ? Math.round((bioCount / totalWasteCount) * 100) : 0
    const recPct = totalWasteCount > 0 ? Math.round((recCount / totalWasteCount) * 100) : 0
    const resPct = totalWasteCount > 0 ? Math.round((resCount / totalWasteCount) * 100) : 0

    const avgConfidence = confidenceSamples > 0 ? (totalConfidenceSum / confidenceSamples) * 100 : 0

    const filteredTrash = trashRecords.filter((t) => {
      if (selectedYear !== 'all' && t.date.getFullYear().toString() !== selectedYear) return false
      if (selectedMonth !== 'all' && t.date.getMonth().toString() !== selectedMonth) return false
      return true
    })

    const filteredNotifs = notifications.filter((n) => {
      if (selectedYear !== 'all' && n.date.getFullYear().toString() !== selectedYear) return false
      if (selectedMonth !== 'all' && n.date.getMonth().toString() !== selectedMonth) return false
      return true
    })

    let bioFullEpisodes = 0
    let recFullEpisodes = 0
    let resFullEpisodes = 0

    const sortedTrash = [...filteredTrash].sort((a, b) => a.date.getTime() - b.date.getTime())
    let wasBioFull = false
    let wasRecFull = false
    let wasResFull = false

    sortedTrash.forEach((t) => {
      const isBio = t.bioFill >= 85 || String(t.bioStatus).toUpperCase().includes('FULL')
      if (isBio && !wasBioFull) bioFullEpisodes++
      wasBioFull = isBio

      const isRec = t.recFill >= 85 || String(t.recStatus).toUpperCase().includes('FULL')
      if (isRec && !wasRecFull) recFullEpisodes++
      wasRecFull = isRec

      const isRes = t.resFill >= 85 || String(t.resStatus).toUpperCase().includes('FULL')
      if (isRes && !wasResFull) resFullEpisodes++
      wasResFull = isRes
    })

    const notifBioFullCount = filteredNotifs.filter((n) => {
      const name = String(n.category || n.label || '').toLowerCase()
      const isFull = String(n.status || '').toUpperCase().includes('HALF') ? false : (String(n.status || '').toUpperCase().includes('FULL') || Number(n.fillPercentage) >= 85)
      return name.includes('bio') && isFull
    }).length

    const notifRecFullCount = filteredNotifs.filter((n) => {
      const name = String(n.category || n.label || '').toLowerCase()
      const isFull = String(n.status || '').toUpperCase().includes('HALF') ? false : (String(n.status || '').toUpperCase().includes('FULL') || Number(n.fillPercentage) >= 85)
      return name.includes('rec') && isFull
    }).length

    const notifResFullCount = filteredNotifs.filter((n) => {
      const name = String(n.category || n.label || '').toLowerCase()
      const isFull = String(n.status || '').toUpperCase().includes('HALF') ? false : (String(n.status || '').toUpperCase().includes('FULL') || Number(n.fillPercentage) >= 85)
      return name.includes('res') && isFull
    }).length

    const bioFullTimes = Math.max(notifBioFullCount, bioFullEpisodes)
    const recFullTimes = Math.max(notifRecFullCount, recFullEpisodes)
    const resFullTimes = Math.max(notifResFullCount, resFullEpisodes)

    const latestTrash = trashRecords.length > 0 ? trashRecords[0] : null
    const latestBioFill = latestTrash ? Math.round(latestTrash.bioFill) : 0
    const latestRecFill = latestTrash ? Math.round(latestTrash.recFill) : 0
    const latestResFill = latestTrash ? Math.round(latestTrash.resFill) : 0
    const bioStatus = latestBioFill >= 85 ? 'FULL' : latestBioFill >= 50 ? 'HALF FULL' : 'NORMAL'
    const recStatus = latestRecFill >= 85 ? 'FULL' : latestRecFill >= 50 ? 'HALF FULL' : 'NORMAL'
    const resStatus = latestResFill >= 85 ? 'FULL' : latestResFill >= 50 ? 'HALF FULL' : 'NORMAL'

    return {
      bioFullTimes,
      recFullTimes,
      resFullTimes,
      latestBioFill,
      latestRecFill,
      latestResFill,
      bioStatus,
      recStatus,
      resStatus
    }
  }, [wasteRecords, trashRecords, notifications, selectedYear, selectedMonth])

  const weeklyStats = useMemo(() => {
    const fullEvents = []

    notifications.forEach((n) => {
      const isFull = String(n.status || '').toUpperCase().includes('HALF')
        ? false
        : String(n.status || '').toUpperCase().includes('FULL') || Number(n.fillPercentage) >= 85
      if (isFull) {
        const cat = String(n.category || n.label || '').toLowerCase()
        let comp = 'residual'
        if (cat.includes('bio')) comp = 'biodegradable'
        else if (cat.includes('rec')) comp = 'recyclable'
        fullEvents.push({ date: n.date, compartment: comp })
      }
    })

    const sortedTrash = [...trashRecords].sort((a, b) => a.date.getTime() - b.date.getTime())
    let wasBioFull = false
    let wasRecFull = false
    let wasResFull = false

    sortedTrash.forEach((t) => {
      const isBio = t.bioFill >= 85 || String(t.bioStatus).toUpperCase().includes('FULL')
      if (isBio && !wasBioFull) {
        fullEvents.push({ date: t.date, compartment: 'biodegradable' })
      }
      wasBioFull = isBio

      const isRec = t.recFill >= 85 || String(t.recStatus).toUpperCase().includes('FULL')
      if (isRec && !wasRecFull) {
        fullEvents.push({ date: t.date, compartment: 'recyclable' })
      }
      wasRecFull = isRec

      const isRes = t.resFill >= 85 || String(t.resStatus).toUpperCase().includes('FULL')
      if (isRes && !wasResFull) {
        fullEvents.push({ date: t.date, compartment: 'residual' })
      }
      wasResFull = isRes
    })

    const deduplicated = []
    fullEvents.sort((a, b) => a.date.getTime() - b.date.getTime())
    fullEvents.forEach((ev) => {
      const dup = deduplicated.some(
        (d) => d.compartment === ev.compartment && Math.abs(d.date.getTime() - ev.date.getTime()) < 5 * 60 * 1000
      )
      if (!dup) deduplicated.push(ev)
    })

    const filtered = deduplicated.filter((ev) => {
      if (selectedYear !== 'all' && ev.date.getFullYear().toString() !== selectedYear) return false
      if (selectedMonth !== 'all' && ev.date.getMonth().toString() !== selectedMonth) return false
      return true
    })

    if (selectedMonth !== 'all') {
      const year = selectedYear !== 'all' ? parseInt(selectedYear, 10) : new Date().getFullYear()
      const month = parseInt(selectedMonth, 10)
      const monthName = monthsList.find((m) => m.value === selectedMonth)?.label || 'Month'
      const totalDays = new Date(year, month + 1, 0).getDate()

      const weeks = [
        { name: 'Week 1', startDay: 1, endDay: 7 },
        { name: 'Week 2', startDay: 8, endDay: 14 },
        { name: 'Week 3', startDay: 15, endDay: 21 },
        { name: 'Week 4', startDay: 22, endDay: 28 }
      ]
      if (totalDays > 28) {
        weeks.push({ name: 'Week 5', startDay: 29, endDay: totalDays })
      }

      return weeks.map((w) => {
        const start = new Date(year, month, w.startDay, 0, 0, 0, 0)
        const end = new Date(year, month, w.endDay, 23, 59, 59, 999)
        const label = `${w.name} (${monthName.slice(0, 3)} ${String(w.startDay).padStart(2, '0')} - ${monthName.slice(0, 3)} ${String(w.endDay).padStart(2, '0')}, ${year})`

        const weekEvents = filtered.filter((e) => e.date >= start && e.date <= end)
        const bioCount = weekEvents.filter((e) => e.compartment === 'biodegradable').length
        const recCount = weekEvents.filter((e) => e.compartment === 'recyclable').length
        const resCount = weekEvents.filter((e) => e.compartment === 'residual').length

        return {
          key: `${year}-${month}-${w.name}`,
          weekLabel: label,
          bioCount,
          recCount,
          resCount,
          totalFull: bioCount + recCount + resCount
        }
      })
    }

    const weekMap = new Map()
    filtered.forEach((ev) => {
      const d = new Date(ev.date)
      const day = d.getDay()
      const diff = (day + 6) % 7
      const monday = new Date(d)
      monday.setDate(d.getDate() - diff)
      monday.setHours(0, 0, 0, 0)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)

      const key = monday.toISOString().slice(0, 10)
      const mStr = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      const sStr = sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      const label = `Week of ${mStr} - ${sStr}`

      if (!weekMap.has(key)) {
        weekMap.set(key, {
          key,
          weekLabel: label,
          startDate: monday,
          bioCount: 0,
          recCount: 0,
          resCount: 0,
          totalFull: 0
        })
      }

      const row = weekMap.get(key)
      if (ev.compartment === 'biodegradable') row.bioCount++
      else if (ev.compartment === 'recyclable') row.recCount++
      else if (ev.compartment === 'residual') row.resCount++
      row.totalFull++
    })

    let result = Array.from(weekMap.values()).sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    if (result.length === 0) {
      const now = new Date()
      for (let i = 0; i < 4; i++) {
        const monday = new Date(now)
        monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - i * 7)
        monday.setHours(0, 0, 0, 0)
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        const mStr = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        const sStr = sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        result.push({
          key: monday.toISOString().slice(0, 10),
          weekLabel: `Week of ${mStr} - ${sStr}`,
          bioCount: 0,
          recCount: 0,
          resCount: 0,
          totalFull: 0
        })
      }
    }
    return result
  }, [notifications, trashRecords, selectedYear, selectedMonth, monthsList])

  const [isPrinting, setIsPrinting] = useState(false)

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true)
    const handleAfterPrint = () => setIsPrinting(false)
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage) || 1
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return filteredEntries.slice(start, start + itemsPerPage)
  }, [filteredEntries, currentPage, itemsPerPage])

  const displayEntries = useMemo(() => {
    return isPrinting ? filteredEntries : paginatedEntries
  }, [isPrinting, filteredEntries, paginatedEntries])

  const handlePrint = () => {
    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 150)
  }

  const resetFilters = () => {
    setSearchQuery('')
    setSelectedMonth('all')
    setSelectedYear('all')
    setCurrentPage(1)
  }

  const handleTabNavigation = (id) => {
    setActiveTab(id)
    if (onTabChange) {
      onTabChange(id)
    }
  }

  const getMonthName = (mVal) => {
    if (mVal === 'all') return 'All Months'
    const found = monthsList.find((m) => m.value === mVal)
    return found ? found.label : mVal
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex print:bg-white print:text-black print:block print:h-auto print:overflow-visible">
      <div className="print:hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabNavigation}
          deviceIp={effectiveDeviceIp}
          isOnline={propIsOnline !== undefined ? propIsOnline : !propIsOffline}
          onLogout={onLogout}
        />
      </div>

      <div className="flex-1 min-w-0 py-8 px-4 sm:px-8 overflow-y-auto print:p-0 print:overflow-visible">
        <main className="w-full max-w-6xl mx-auto flex flex-col gap-6 print:max-w-none">
          <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  EcoBin IoT System Analytics & Waste Audit Report
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  Automated Smart Waste Classification and Fill Telemetry Logs
                </p>
              </div>
              <div className="text-right text-xs text-slate-600 font-mono">
                <div>Printed: {new Date().toLocaleString()}</div>
                <div>Device IP: {effectiveDeviceIp}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-200 text-xs text-slate-700">
              <span><strong>Filter Year:</strong> {selectedYear === 'all' ? 'All Years' : selectedYear}</span>
              <span><strong>Filter Month:</strong> {getMonthName(selectedMonth)}</span>
              <span><strong>Biodegradable Times Full:</strong> {stats.bioFullTimes}</span>
              <span><strong>Recyclable Times Full:</strong> {stats.recFullTimes}</span>
              <span><strong>Residual Times Full:</strong> {stats.resFullTimes}</span>
            </div>
          </div>

          <header className="pb-4 border-b border-slate-200 print:hidden">
            <div className="flex items-center gap-2.5">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
                  Analytics & Reports
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Real-time waste segregation statistics, classification intelligence, and historical data
                </p>
              </div>
            </div>
          </header>

          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm print:hidden">
            <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                <Filter className="w-4 h-4 text-emerald-600" />
                <span>Search & Filter Parameters</span>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Showing {filteredEntries.length} matching entries
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    if (currentPage !== 1) setCurrentPage(1)
                  }}
                  placeholder="Search waste type, status, date, IP..."
                  className="w-full pl-9 pr-9 py-2 rounded text-sm bg-white border border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 transition-all placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full px-3 py-2 rounded text-xs sm:text-sm bg-slate-50 border border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 transition-all cursor-pointer font-medium"
                >
                  <option value="all">All Months</option>
                  {monthsList.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full px-3 py-2 rounded text-xs sm:text-sm bg-slate-50 border border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 transition-all cursor-pointer font-medium"
                >
                  <option value="all">All Years</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y.toString()}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="w-24 text-[13px] inline-flex items-center justify-center gap-2 px-2 py-2 rounded font-semibold bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600 shadow-sm shadow-emerald-200 transition-all hover:shadow cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-5 print:grid-cols-3">
            <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm flex flex-col justify-between print:border-slate-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <Leaf className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Biodegradable</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Compartment 1</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Full &ge; 85%
                </span>
              </div>

              <div className="my-5">
                <div className="text-4xl sm:text-5xl font-black text-emerald-600 font-mono tracking-tight">
                  {stats.bioFullTimes}
                </div>
                <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">
                  Times Became Full
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>Current Fill: <strong className="font-mono text-slate-900">{stats.latestBioFill}%</strong></span>
                <span className="text-emerald-700 font-semibold">{stats.bioStatus}</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-blue-200 shadow-sm flex flex-col justify-between print:border-slate-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                    <Recycle className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Recyclable</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Compartment 2</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                  Full &ge; 85%
                </span>
              </div>

              <div className="my-5">
                <div className="text-4xl sm:text-5xl font-black text-blue-600 font-mono tracking-tight">
                  {stats.recFullTimes}
                </div>
                <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">
                  Times Became Full
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>Current Fill: <strong className="font-mono text-slate-900">{stats.latestRecFill}%</strong></span>
                <span className="text-blue-700 font-semibold">{stats.recStatus}</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-purple-200 shadow-sm flex flex-col justify-between print:border-slate-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                    <Trash2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Residual</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Compartment 3</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                  Full &ge; 85%
                </span>
              </div>

              <div className="my-5">
                <div className="text-4xl sm:text-5xl font-black text-purple-600 font-mono tracking-tight">
                  {stats.resFullTimes}
                </div>
                <div className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">
                  Times Became Full
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>Current Fill: <strong className="font-mono text-slate-900">{stats.latestResFill}%</strong></span>
                <span className="text-purple-700 font-semibold">{stats.resStatus}</span>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:overflow-visible print:bg-white print:h-auto">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <Calendar className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Weekly Full Compartment Frequency</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Count of times each compartment reached capacity (&ge; 85%) per week
                  </p>
                </div>
              </div>
              <div className="text-xs font-semibold text-slate-500 font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                {selectedMonth !== 'all' ? `${getMonthName(selectedMonth)} ${selectedYear === 'all' ? '' : selectedYear}` : (selectedYear === 'all' ? 'All Weeks' : `Year ${selectedYear}`)}
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible print:bg-white">
              <table className="w-full text-left text-xs sm:text-sm print:text-xs print:w-full print:table-fixed">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider print:bg-slate-100 print:text-black">
                    <th className="py-3.5 px-5 print:py-2 print:px-2 print:w-[28%]">Week Interval</th>
                    <th className="py-3.5 px-5 text-center print:py-2 print:px-2 print:w-[18%]">
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold">
                        <Leaf className="w-3.5 h-3.5" />
                        Biodegradable
                      </span>
                    </th>
                    <th className="py-3.5 px-5 text-center print:py-2 print:px-2 print:w-[18%]">
                      <span className="inline-flex items-center gap-1.5 text-blue-700 font-bold">
                        <Recycle className="w-3.5 h-3.5" />
                        Recyclable
                      </span>
                    </th>
                    <th className="py-3.5 px-5 text-center print:py-2 print:px-2 print:w-[18%]">
                      <span className="inline-flex items-center gap-1.5 text-purple-700 font-bold">
                        <Trash2 className="w-3.5 h-3.5" />
                        Residual
                      </span>
                    </th>
                    <th className="py-3.5 px-5 text-center font-bold print:py-2 print:px-2 print:w-[18%]">Total Times Full</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {weeklyStats.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-50/70 transition-colors print:hover:bg-transparent">
                      <td className="py-3.5 px-5 whitespace-nowrap font-semibold text-slate-900 print:py-2 print:px-2 print:text-xs">
                        {row.weekLabel}
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap text-center print:py-2 print:px-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full font-mono text-xs font-bold border print:px-2 print:py-0.5 ${
                            row.bioCount > 0
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {row.bioCount}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap text-center print:py-2 print:px-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full font-mono text-xs font-bold border print:px-2 print:py-0.5 ${
                            row.recCount > 0
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {row.recCount}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap text-center print:py-2 print:px-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full font-mono text-xs font-bold border print:px-2 print:py-0.5 ${
                            row.resCount > 0
                              ? 'bg-purple-50 text-purple-800 border-purple-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {row.resCount}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap text-center font-mono font-black text-slate-900 print:py-2 print:px-2">
                        <span
                          className={`inline-block px-3.5 py-1 rounded-full text-xs print:px-2 print:py-0.5 ${
                            row.totalFull > 0
                              ? 'bg-amber-100 text-amber-900 font-extrabold'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {row.totalFull}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:border-slate-300 print:shadow-none print:overflow-visible print:bg-white print:h-auto">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Historical Data & Logged Events</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed timeline of automated sensor readings, classifications, and system triggers
                </p>
              </div>
              <div className="text-xs font-medium text-slate-500 font-mono">
                {isPrinting
                  ? `Showing all ${filteredEntries.length} entries`
                  : `Showing ${paginatedEntries.length} of ${filteredEntries.length} entries`}
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-[13px] print:text-xs print:w-full print:table-fixed">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[13px] text-center font-bold text-slate-500 tracking-wider print:bg-slate-100 print:text-black">
                    <th className="py-3.5 px-6 min-w-[220px] w-1/3 print:min-w-0 print:w-[34%] print:py-2 print:px-2">Date & Time</th>
                    <th className="py-3.5 px-4 print:w-[22%] print:py-2 print:px-2">Compartment</th>
                    <th className="py-3.5 px-4 print:w-[22%] print:py-2 print:px-2">Percentage</th>
                    <th className="py-3.5 px-4 print:w-[22%] print:py-2 print:px-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {displayEntries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400">
                        <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-semibold text-slate-600">No matching records found</p>
                        <p className="text-xs text-slate-400 mt-1">Try clearing or adjusting your search filters.</p>
                      </td>
                    </tr>
                  ) : (
                    displayEntries.map((item) => {
                      const isBio = item.category.includes('bio')
                      const isRec = item.category.includes('rec')
                      const isRes = item.category.includes('res')

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors print:hover:bg-transparent print:break-inside-avoid">
                          <td className="py-3.5 px-6 whitespace-nowrap font-mono text-xs text-slate-600 print:py-2 print:px-2">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-semibold text-slate-900">{item.formattedDate || formatDateTime(item.date)}</span>
                            </div>
                          </td>

                          <td className="py-3 text-left px-4 whitespace-nowrap print:py-2 print:px-2">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border print:px-2 print:py-0.5 ${
                                isBio
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : isRec
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : isRes
                                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                                  : 'bg-slate-50 text-slate-800 border-slate-200'
                              }`}
                            >
                              {isBio && <Leaf className="w-3 h-3 text-emerald-600" />}
                              {isRec && <Recycle className="w-3 h-3 text-blue-600" />}
                              {isRes && <Trash2 className="w-3 h-3 text-purple-600" />}
                              {item.label}
                            </span>
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap font-mono text-center text-slate-800 print:py-2 print:px-2">
                            {item.metric}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap print:py-2 print:px-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border print:px-1.5 print:py-0.5 ${
                                item.statusType === 'danger'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : item.statusType === 'warning'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : item.statusType === 'success'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between print:hidden">
                <div className="text-xs text-slate-500 font-medium">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 disabled:opacity-40 hover:bg-slate-200 transition-colors"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                    let pageNum = idx + 1
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = currentPage - 2 + idx
                      if (pageNum > totalPages) pageNum = totalPages - (4 - idx)
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                          currentPage === pageNum
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 disabled:opacity-40 hover:bg-slate-200 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
