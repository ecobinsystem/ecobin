import React, { useState, useEffect } from 'react'
import {
  Settings as SettingsIcon,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound,
  Phone,
  Send,
  ShieldCheck
} from 'lucide-react'
import Sidebar from './sidebar'
import { db } from '../../firebase'
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { sendSms } from '../../services/pushbullet'
import { checkContactNumber, isValidContactNumber } from '../checker/contactChecker'
import {
  checkPasswordMatch,
  doPasswordsMatch,
  checkCurrentPassword,
  sha256
} from '../checker/passwordChecker'

export default function Settings({
  isOffline: propIsOffline,
  isOnline: propIsOnline,
  onTabChange,
  deviceIp: propDeviceIp,
  onLogout
}) {
  const [activeTab, setActiveTab] = useState('settings')
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('ecobin_auth_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loadingUser, setLoadingUser] = useState(() => {
    try {
      const saved = localStorage.getItem('ecobin_auth_user')
      return !saved
    } catch {
      return true
    }
  })

  const [contactNumber, setContactNumber] = useState(() => {
    try {
      const saved = localStorage.getItem('ecobin_auth_user')
      if (saved) {
        const u = JSON.parse(saved)
        return u?.contact || u?.identifier || ''
      }
    } catch {}
    return ''
  })
  const [savingContact, setSavingContact] = useState(false)
  const [contactError, setContactError] = useState('')
  const [contactSuccess, setContactSuccess] = useState('')

  const [codeSent, setCodeSent] = useState(false)
  const [sentCode, setSentCode] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeSuccess, setCodeSuccess] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [isContactVerified, setIsContactVerified] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [currentPasswordStatus, setCurrentPasswordStatus] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const effectiveDeviceIp = propDeviceIp || import.meta.env.VITE_ESP32_IP || '192.168.43.221'

  const isNewContact = Boolean(
    currentUser &&
    contactNumber.trim() !== (currentUser?.contact || '').trim()
  )

  useEffect(() => {
    let active = true

    async function loadUserData() {
      setLoadingUser(true)
      let storedUser = null
      try {
        const saved = localStorage.getItem('ecobin_auth_user')
        if (saved) storedUser = JSON.parse(saved)
      } catch {}

      try {
        const snap = await getDocs(collection(db, 'users'))
        if (!active) return

        let matched = null
        if (storedUser?.id) {
          matched = snap.docs.find((d) => d.id === storedUser.id)
        }
        if (!matched && storedUser?.contact) {
          matched = snap.docs.find((d) => (d.data().contact || '').trim() === storedUser.contact.trim())
        }
        if (!matched) {
          matched = snap.docs.find((d) => (d.data().role || '').toLowerCase() === 'admin')
        }
        if (!matched && !snap.empty) {
          matched = snap.docs[0]
        }

        if (matched) {
          const data = matched.data()
          const loaded = {
            id: matched.id,
            name: data.name || matched.id,
            contact: data.contact || '',
            role: data.role || 'admin',
            storedPassword: data.password || ''
          }
          setCurrentUser(loaded)
          setContactNumber(data.contact || '')
        } else if (storedUser) {
          setCurrentUser(storedUser)
          setContactNumber(storedUser.contact || '')
        }
      } catch {
        if (storedUser) {
          setCurrentUser(storedUser)
          setContactNumber(storedUser.contact || '')
        }
      } finally {
        if (active) setLoadingUser(false)
      }
    }

    loadUserData()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!contactSuccess) return
    const timer = setTimeout(() => {
      setContactSuccess('')
    }, 4000)
    return () => clearTimeout(timer)
  }, [contactSuccess])

  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => {
      setSuccess('')
    }, 4000)
    return () => clearTimeout(timer)
  }, [success])

  useEffect(() => {
    let active = true
    async function verifyCurrent() {
      if (!currentPassword) {
        setCurrentPasswordStatus('')
        return
      }
      if (!currentUser?.storedPassword) {
        setCurrentPasswordStatus('')
        return
      }
      const check = await checkCurrentPassword(currentPassword, currentUser.storedPassword)
      if (!active) return
      if (check.isValid) {
        setCurrentPasswordStatus('correct')
      } else {
        setCurrentPasswordStatus('incorrect')
      }
    }
    verifyCurrent()
    return () => {
      active = false
    }
  }, [currentPassword, currentUser?.storedPassword])

  function handleTabNavigation(id) {
    setActiveTab(id)
    if (onTabChange) {
      onTabChange(id)
    }
  }

  async function handleSendCode() {
    if (!isValidContactNumber(contactNumber)) return
    setSendingCode(true)
    setCodeError('')
    setCodeSuccess('')
    setIsContactVerified(false)
    const generated = Math.floor(100000 + Math.random() * 900000).toString()
    setSentCode(generated)
    setCodeSent(true)
    setCodeSuccess('Verification code has been sent to your contact number.')
    try {
      await sendSms(contactNumber, `Your EcoBin verification code is: ${generated}`)
    } catch (err) {
      setCodeError('Failed to send SMS: ' + (err.message || 'Please check your connection.'))
    } finally {
      setSendingCode(false)
    }
  }

  function handleVerifyCode() {
    setCodeError('')
    if (!verificationCode || verificationCode.length !== 6) {
      setCodeError('Please enter the complete 6-digit verification code.')
      return
    }
    if (verificationCode !== sentCode) {
      setCodeError('Invalid code. Please check the code sent to your number.')
      return
    }
    setIsContactVerified(true)
    setCodeSuccess('Contact number verified successfully.')
  }

  async function handleContactUpdate(e) {
    e.preventDefault()
    setContactError('')
    setContactSuccess('')

    const check = checkContactNumber(contactNumber)
    if (!check.isValid) {
      setContactError(check.error)
      return
    }

    if (!isContactVerified) {
      setContactError('Please verify the contact number before updating.')
      return
    }

    setSavingContact(true)
    try {
      let targetDocId = currentUser?.id
      const snap = await getDocs(collection(db, 'users'))
      let foundDoc = null
      if (targetDocId) {
        foundDoc = snap.docs.find((d) => d.id === targetDocId)
      }
      if (!foundDoc && currentUser?.contact) {
        foundDoc = snap.docs.find((d) => (d.data().contact || '').trim() === currentUser.contact.trim())
      }
      if (!foundDoc) {
        foundDoc = snap.docs.find((d) => (d.data().role || '').toLowerCase() === 'admin')
      }
      if (foundDoc) {
        targetDocId = foundDoc.id
      }
      if (!targetDocId) {
        setContactError('User document could not be located in Firestore.')
        setSavingContact(false)
        return
      }

      await updateDoc(doc(db, 'users', targetDocId), {
        contact: contactNumber.trim(),
        updatedAt: serverTimestamp()
      })

      const updatedUser = {
        ...(currentUser || {}),
        contact: contactNumber.trim()
      }
      setCurrentUser(updatedUser)
      try {
        localStorage.setItem('ecobin_auth_user', JSON.stringify(updatedUser))
      } catch {}

      setCodeSent(false)
      setSentCode('')
      setVerificationCode('')
      setIsContactVerified(false)
      setCodeError('')
      setCodeSuccess('')
      setContactSuccess('Contact number updated successfully.')
    } catch (err) {
      setContactError('Failed to update contact number: ' + (err.message || 'Please check your connection.'))
    } finally {
      setSavingContact(false)
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!currentPassword) {
      setError('Please enter your current password.')
      return
    }

    const check = checkPasswordMatch(newPassword, confirmPassword)
    if (!check.isValid) {
      setError(check.error)
      return
    }

    if (currentPassword === newPassword) {
      setError('New password cannot be the same as current password.')
      return
    }

    setSubmitting(true)

    try {
      let targetDocId = currentUser?.id
      let currentStoredHash = currentUser?.storedPassword

      const snap = await getDocs(collection(db, 'users'))
      let foundDoc = null

      if (targetDocId) {
        foundDoc = snap.docs.find((d) => d.id === targetDocId)
      }
      if (!foundDoc && currentUser?.contact) {
        foundDoc = snap.docs.find((d) => (d.data().contact || '').trim() === currentUser.contact.trim())
      }
      if (!foundDoc) {
        foundDoc = snap.docs.find((d) => (d.data().role || '').toLowerCase() === 'admin')
      }

      if (foundDoc) {
        targetDocId = foundDoc.id
        currentStoredHash = foundDoc.data().password || ''
      }

      if (!targetDocId) {
        setError('User document could not be located in Firestore.')
        setSubmitting(false)
        return
      }

      const currentCheck = await checkCurrentPassword(currentPassword, currentStoredHash)
      if (!currentCheck.isValid) {
        setError(currentCheck.error)
        setSubmitting(false)
        return
      }

      const newHashed = await sha256(newPassword)
      await updateDoc(doc(db, 'users', targetDocId), {
        password: newHashed,
        updatedAt: serverTimestamp()
      })

      setCurrentUser((prev) => ({
        ...(prev || {}),
        storedPassword: newHashed
      }))

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Your password has been successfully updated.')
    } catch (err) {
      setError('Failed to update password: ' + (err.message || 'Please check your connection.'))
    } finally {
      setSubmitting(false)
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
                  Settings
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Manage your account credentials and security preferences
              </p>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7">
              <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Contact Number
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update your registered contact number
                  </p>
                </div>
              </div>

              {contactError && (
                <div className="mt-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{contactError}</span>
                </div>
              )}

              {contactSuccess && (
                <div className="mt-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-emerald-800 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{contactSuccess}</span>
                </div>
              )}

              <form onSubmit={handleContactUpdate} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
                    Contact Number
                  </label>
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Phone className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={contactNumber}
                        onChange={(e) => {
                          let val = e.target.value
                          if (val.startsWith('+')) {
                            val = '+' + val.slice(1).replace(/\D/g, '')
                          } else {
                            val = val.replace(/\D/g, '')
                          }
                          if (val.startsWith('+63') || val.startsWith('+')) {
                            val = val.slice(0, 13)
                          } else if (val.startsWith('09') || val.startsWith('0')) {
                            val = val.slice(0, 11)
                          } else {
                            val = val.slice(0, 13)
                          }
                          setContactNumber(val)
                          if (contactError) setContactError('')
                          if (codeSent) {
                            setCodeSent(false)
                            setSentCode('')
                            setVerificationCode('')
                            setCodeError('')
                            setCodeSuccess('')
                          }
                          setIsContactVerified(false)
                        }}
                        placeholder="+639123456789 or 09123456789"
                        className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white font-mono"
                      />
                    </div>
                    {isNewContact && isValidContactNumber(contactNumber) && (
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={sendingCode}
                        className="rounded flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 px-3 py-2.5"
                      >
                        <Send size={18} className="shrink-0" />
                        <span>{sendingCode ? 'Sending...' : (codeSent ? 'Resend Code' : 'Send Code')}</span>
                      </button>
                    )}
                  </div>
                  {contactNumber && !isValidContactNumber(contactNumber) && (
                    <p className="text-[11px] text-rose-500 mt-1 font-medium">
                      {checkContactNumber(contactNumber).error}
                    </p>
                  )}
                </div>

                {codeSent && (
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <label className="block text-xs font-bold text-slate-700 tracking-wider">
                      Enter 6-Digit Code
                    </label>
                    <div className="flex gap-2 items-center">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          maxLength={6}
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit code"
                          className="w-full px-3.5 py-2.5 text-sm rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleVerifyCode}
                        disabled={verificationCode.length !== 6 || isContactVerified}
                        className="rounded flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 px-3 py-2.5"
                      >
                        <ShieldCheck size={18} className="shrink-0" />
                        <span>{isContactVerified ? 'Verified' : 'Verify Code'}</span>
                      </button>
                    </div>
                    {codeError && (
                      <p className="text-[11px] text-rose-500 mt-1 font-medium">
                        {codeError}
                      </p>
                    )}
                    {codeSuccess && (
                      <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                        {codeSuccess}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={savingContact || loadingUser || !isValidContactNumber(contactNumber) || !isContactVerified}
                    className="inline-flex items-center justify-center gap-2 px-2 py-2 rounded text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingContact ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating Contact...</span>
                      </>
                    ) : (
                      <>
                        <Phone size={18} />
                        <span>Update Contact Number</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-7">
              <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Change Password
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update your password credentials
                  </p>
                </div>
              </div>

              {error && (
                <div className="mt-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="mt-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-emerald-800 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </div>
              )}

              <form onSubmit={handlePasswordChange} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
                    Current Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value)
                        if (error) setError('')
                      }}
                      placeholder="Enter your current password"
                      className="w-full pl-10 pr-11 py-2.5 text-sm rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {currentPassword && (
                    currentPasswordStatus === 'correct' ? (
                      <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                        Current password is correct.
                      </p>
                    ) : currentPasswordStatus === 'incorrect' ? (
                      <p className="text-[11px] text-rose-500 mt-1 font-medium">
                        Current password is incorrect.
                      </p>
                    ) : null
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value)
                        if (error) setError('')
                      }}
                      placeholder="Enter new password"
                      className="w-full pl-10 pr-11 py-2.5 text-sm rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPassword && newPassword.length < 4 && (
                    <p className="text-[11px] text-rose-500 mt-1 font-medium">
                      Password must be at least 4 characters.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        if (error) setError('')
                      }}
                      placeholder="Confirm new password"
                      className="w-full pl-10 pr-11 py-2.5 text-sm rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && newPassword && (
                    doPasswordsMatch(newPassword, confirmPassword) ? (
                      <p className="text-[11px] text-emerald-600 mt-1 font-medium">
                        Passwords match.
                      </p>
                    ) : (
                      <p className="text-[11px] text-rose-500 mt-1 font-medium">
                        Passwords do not match.
                      </p>
                    )
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submitting || !currentPassword || currentPasswordStatus !== 'correct' || !checkPasswordMatch(newPassword, confirmPassword).isValid}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-200 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <span>Update Password</span>
                    )}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
