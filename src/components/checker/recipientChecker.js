import { db } from '../../firebase'
import { collection, getDocs } from 'firebase/firestore'

export function isRecipientNameTaken(name, existingRecipients = [], currentId = null) {
  if (!name || !name.trim()) return false
  const target = name.trim().toLowerCase()
  return (existingRecipients || []).some((r) => {
    const id = r.id || r.name
    if (currentId && (id === currentId || (r.name && r.name.toLowerCase() === String(currentId).toLowerCase()))) {
      return false
    }
    const rName = (r.name || r.recipientName || '').trim().toLowerCase()
    return rName === target
  })
}

export function checkRecipientName(name, existingRecipients = [], currentId = null) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Recipient name is required.',
      isDuplicate: false
    }
  }

  if (isRecipientNameTaken(trimmed, existingRecipients, currentId)) {
    return {
      isValid: false,
      error: 'Recipient already added.',
      isDuplicate: true
    }
  }

  return {
    isValid: true,
    error: '',
    isDuplicate: false
  }
}

export async function checkRecipientNameExistsInDb(name, currentId = null) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Recipient name is required.',
      isDuplicate: false
    }
  }

  try {
    let list = []
    const saved = localStorage.getItem('ecobin_recipients')
    if (saved) {
      try {
        list = JSON.parse(saved) || []
      } catch {
        list = []
      }
    }

    const snap = await getDocs(collection(db, 'recipients'))
    snap.docs.forEach((doc) => {
      const d = doc.data()
      list.push({ id: doc.id, name: d.name || doc.id, ...d })
    })

    return checkRecipientName(trimmed, list, currentId)
  } catch {
    return {
      isValid: true,
      error: '',
      isDuplicate: false
    }
  }
}

export const validateRecipientName = checkRecipientName
export default checkRecipientName
