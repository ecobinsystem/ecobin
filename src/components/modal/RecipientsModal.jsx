import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { Users, X, Phone, User, RefreshCw, UserPlus, Search, Pencil, Trash2 } from 'lucide-react'
import AddRecipientModal from './AddRecipientModal'
import DeleteRecipientModal from './DeleteRecipientModal'

export default function RecipientsModal({
  isOpen = false,
  onClose,
  recipients: propRecipients
}) {
  const [recipients, setRecipients] = useState(() => {
    try {
      const saved = localStorage.getItem('ecobin_recipients')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(true)
  const [isAddRecipientOpen, setIsAddRecipientOpen] = useState(false)
  const [editingRecipient, setEditingRecipient] = useState(null)
  const [deletingRecipient, setDeletingRecipient] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (propRecipients !== undefined) {
      setRecipients(propRecipients || [])
      setLoading(false)
      return
    }

    const unsubscribe = onSnapshot(
      collection(db, 'recipients'),
      (snapshot) => {
        setLoading(false)
        if (snapshot.empty) {
          try {
            const saved = localStorage.getItem('ecobin_recipients')
            if (saved) {
              setRecipients(JSON.parse(saved))
              return
            }
          } catch {}
          setRecipients([])
          return
        }
        const docs = snapshot.docs.map((doc) => {
          const d = doc.data()
          return {
            id: doc.id,
            name: d.name || doc.id,
            contact: d.contact || d.contactNumber || d.phone || '--',
            ...d
          }
        })

        try {
          const saved = localStorage.getItem('ecobin_recipients')
          const localList = saved ? JSON.parse(saved) : []
          const combined = [...docs]
          localList.forEach((item) => {
            if (!combined.some((c) => c.id === item.id || c.name === item.name)) {
              combined.push(item)
            }
          })
          setRecipients(combined)
          localStorage.setItem('ecobin_recipients', JSON.stringify(combined))
        } catch {
          setRecipients(docs)
        }
      },
      (err) => {
        console.error(err)
        setLoading(false)
        try {
          const saved = localStorage.getItem('ecobin_recipients')
          if (saved) {
            setRecipients(JSON.parse(saved))
          }
        } catch {}
      }
    )

    return () => unsubscribe()
  }, [propRecipients])

  function handleRecipientAdded(newRecip) {
    setRecipients((prev) => {
      const updated = [newRecip, ...prev.filter((r) => r.id !== newRecip.id && r.name !== newRecip.name)]
      try {
        localStorage.setItem('ecobin_recipients', JSON.stringify(updated))
      } catch {}
      return updated
    })
  }

  function handleRecipientUpdated(updatedRecip) {
    setRecipients((prev) => {
      const oldId = editingRecipient?.id || editingRecipient?.name
      const filtered = prev.filter((r) => r.id !== updatedRecip.id && r.name !== updatedRecip.name && (!oldId || (r.id !== oldId && r.name !== editingRecipient?.name)))
      const next = [updatedRecip, ...filtered]
      try {
        localStorage.setItem('ecobin_recipients', JSON.stringify(next))
      } catch {}
      return next
    })
    setEditingRecipient(null)
  }

  function handleRecipientDeleted(deletedRecip) {
    const docId = deletedRecip?.id || deletedRecip?.name
    setRecipients((prev) => {
      const next = prev.filter((r) => r.id !== docId && r.name !== deletedRecip.name)
      try {
        localStorage.setItem('ecobin_recipients', JSON.stringify(next))
      } catch {}
      return next
    })
    setDeletingRecipient(null)
  }

  if (!isOpen) {
    return null
  }

  const filteredRecipients = recipients.filter((recip) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const nameMatch = String(recip.name || recip.recipientName || '').toLowerCase().includes(q)
    const phoneMatch = String(recip.contact || recip.contactNumber || recip.phone || '').toLowerCase().includes(q)
    const roleMatch = String(recip.role || '').toLowerCase().includes(q)
    return nameMatch || phoneMatch || roleMatch
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Notification Recipients
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Personnel directory receiving automated alerts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X size={18}/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1 flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recipients by name or phone..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-slate-50/60 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-md"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setEditingRecipient(null)
                setIsAddRecipientOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Recipient</span>
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-center border-b border-slate-200 text-[12px] font-bold tracking-wider text-slate-500">
                  <th className="py-3 px-4">Recipient Name</th>
                  <th className="py-3 px-4">Contact Number</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                {loading ? (
                  <tr>
                    <td colSpan="3" className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-600 mb-1.5" />
                      <span>Loading recipients...</span>
                    </td>
                  </tr>
                ) : filteredRecipients.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="py-8 text-center text-slate-400">
                      {searchQuery ? 'No recipients match your search' : 'No recipients configured'}
                    </td>
                  </tr>
                ) : (
                  filteredRecipients.map((recip) => (
                    <tr key={recip.id || recip.name} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">
                              {recip.name || recip.recipientName || 'Unnamed Recipient'}
                            </div>
                            {recip.role && (
                              <div className="text-[10px] text-slate-400">
                                {recip.role}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{recip.contact || recip.contactNumber || recip.phone || '--'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingRecipient(recip)}
                            className="p-1.5 rounded text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition"
                            aria-label="Edit recipient"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingRecipient(recip)}
                            className="p-1.5 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition"
                            aria-label="Delete recipient"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2 py-2 rounded bg-slate-500 hover:bg-slate-600 text-white text-xs font-semibold shadow-sm transition"
          >
            <X size={18} />
            <span>Close</span>
          </button>
        </div>
      </div>

      <AddRecipientModal
        isOpen={isAddRecipientOpen || !!editingRecipient}
        recipientToEdit={editingRecipient}
        existingRecipients={recipients}
        onClose={() => {
          setIsAddRecipientOpen(false)
          setEditingRecipient(null)
        }}
        onRecipientAdded={handleRecipientAdded}
        onRecipientUpdated={handleRecipientUpdated}
      />

      <DeleteRecipientModal
        isOpen={!!deletingRecipient}
        recipient={deletingRecipient}
        onClose={() => setDeletingRecipient(null)}
        onDeleted={handleRecipientDeleted}
      />
    </div>
  )
}
