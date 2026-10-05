import React, { useState, useEffect } from 'react'
import { db } from '../../firebase'
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { UserPlus, X, User, Phone, Loader2, Pencil } from 'lucide-react'
import { checkRecipientName, isRecipientNameTaken } from '../checker/recipientChecker'

export default function AddRecipientModal({
  isOpen = false,
  onClose,
  onRecipientAdded,
  recipientToEdit = null,
  onRecipientUpdated,
  existingRecipients: propExistingRecipients
}) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadedRecipients, setLoadedRecipients] = useState([])

  useEffect(() => {
    if (recipientToEdit) {
      setName(recipientToEdit.name || '')
      setContact(recipientToEdit.contact || '')
    } else {
      setName('')
      setContact('')
    }
    setError('')
  }, [recipientToEdit, isOpen])

  useEffect(() => {
    if (!isOpen) return
    let isCancelled = false
    async function loadExisting() {
      let list = []
      try {
        const saved = localStorage.getItem('ecobin_recipients')
        if (saved) list = JSON.parse(saved) || []
      } catch {}
      try {
        const snap = await getDocs(collection(db, 'recipients'))
        if (!isCancelled) {
          const docs = snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, ...d.data() }))
          const merged = [...docs]
          list.forEach((item) => {
            if (!merged.some((m) => m.id === item.id || m.name === item.name)) {
              merged.push(item)
            }
          })
          setLoadedRecipients(merged)
        }
      } catch {
        if (!isCancelled) setLoadedRecipients(list)
      }
    }
    loadExisting()
    return () => {
      isCancelled = true
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const recipientsList = propExistingRecipients || loadedRecipients
  const isNameDuplicate = Boolean(
    name.trim() && isRecipientNameTaken(name.trim(), recipientsList, recipientToEdit?.id || recipientToEdit?.name)
  )

  async function handleSubmit(e) {
    e.preventDefault()
    const nameCheck = checkRecipientName(name, recipientsList, recipientToEdit?.id || recipientToEdit?.name)
    if (!nameCheck.isValid) {
      setError(nameCheck.error)
      return
    }
    if (!contact.trim()) {
      setError('Please enter the contact number.')
      return
    }
    if (contact.length !== 13 || !/^\+63\d{10}$/.test(contact)) {
      setError('Contact number must be exactly 13 characters (e.g. +639123456789).')
      return
    }

    setSaving(true)
    setError('')

    const trimmedName = name.trim()
    const docId = trimmedName.replace(/\//g, '-')
    const updatedRecipient = {
      ...(recipientToEdit || {}),
      id: docId,
      name: trimmedName,
      contact: contact.trim()
    }

    try {
      if (recipientToEdit) {
        const oldDocId = recipientToEdit.id || recipientToEdit.name
        if (oldDocId && oldDocId !== docId) {
          await deleteDoc(doc(db, 'recipients', oldDocId))
        }
      }
      await setDoc(doc(db, 'recipients', docId), {
        name: trimmedName,
        contact: contact.trim(),
        createdAt: recipientToEdit?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error(err)
    }

    try {
      const existing = localStorage.getItem('ecobin_recipients')
      const list = existing ? JSON.parse(existing) : []
      const oldDocId = recipientToEdit?.id || recipientToEdit?.name
      const filtered = list.filter((r) => r.id !== docId && r.name !== trimmedName && (!oldDocId || (r.id !== oldDocId && r.name !== recipientToEdit?.name)))
      const nextList = [updatedRecipient, ...filtered]
      localStorage.setItem('ecobin_recipients', JSON.stringify(nextList))
    } catch (err) {
      console.error(err)
    }

    if (recipientToEdit && onRecipientUpdated) {
      onRecipientUpdated(updatedRecipient)
    } else if (onRecipientAdded) {
      onRecipientAdded(updatedRecipient)
    }

    setName('')
    setContact('')
    setSaving(false)
    onClose()
  }

  function handleContactFocus() {
    if (!contact) {
      setContact('+63')
    }
  }

  function handleContactChange(e) {
    let val = e.target.value
    if (!val) {
      setContact('')
      return
    }
    if (!val.startsWith('+63')) {
      const digits = val.replace(/\D/g, '')
      if (digits.startsWith('63')) {
        val = '+' + digits
      } else {
        val = '+63' + digits
      }
    } else {
      const rest = val.slice(3).replace(/\D/g, '')
      val = '+63' + rest
    }
    if (val.length > 13) {
      val = val.slice(0, 13)
    }
    setContact(val)
  }

  function handleCancel() {
    setName('')
    setContact('')
    setError('')
    onClose()
  }

  const isContactInvalid = !contact.startsWith('+63') || contact.length < 13 || !/^\+63\d{10}$/.test(contact)

  function getContactProblem() {
    if (!contact) {
      return 'Number must start with +63 and be 13 characters'
    }
    if (!contact.startsWith('+63')) {
      return 'Number must start with +63'
    }
    if (contact.length < 13) {
      return `Number is too short (${contact.length}/13 characters). Requires 10 digits after +63.`
    }
    if (!/^\+63\d{10}$/.test(contact)) {
      return 'Only digits are allowed after +63'
    }
    return ''
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-sm">
              {recipientToEdit ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {recipientToEdit ? 'Edit Recipient' : 'Add New Recipient'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {recipientToEdit ? 'Update contact for alert notifications' : 'Register contact for alert notifications'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Recipient Name
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={name}
                autoCapitalize="words"
                onChange={(e) => {
                  const val = e.target.value
                  const formatted = val.replace(/(?:^|\s)\S/g, (char) => char.toUpperCase())
                  setName(formatted)
                  if (error) setError('')
                }}
                placeholder="e.g. Engr. Marcus Rivera"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white shadow-xs"
                disabled={saving}
              />
            </div>
            {isNameDuplicate && (
              <p className="text-[11px] text-rose-500 mt-1 font-medium">
                Recipient already added.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Contact Number
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 pointer-events-none">
                <Phone className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={contact}
                onFocus={handleContactFocus}
                onClick={handleContactFocus}
                onChange={handleContactChange}
                maxLength={13}
                placeholder="+639123456789"
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white font-mono shadow-xs"
                disabled={saving}
              />
            </div>
            {getContactProblem() && (
              <p className="text-[11px] text-rose-500 mt-1 font-medium">
                {getContactProblem()}
              </p>
            )}
          </div>

          <div className="pt-2 flex items-center gap-2.5 justify-end">
            <button
              type="submit"
              disabled={saving || !name.trim() || isNameDuplicate || isContactInvalid}
              className="text-[12px] inline-flex items-center gap-1 px-2 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white  font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  {recipientToEdit ? <Pencil className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>{recipientToEdit ? 'Save Changes' : 'Save Recipient'}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-[12px] inline-flex items-center gap-1 px-2 py-2 rounded bg-slate-500 hover:bg-slate-600 text-white text-xs font-semibold transition"
              disabled={saving}
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
