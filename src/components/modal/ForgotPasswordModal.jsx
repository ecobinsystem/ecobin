import React, { useState, useEffect } from 'react'
import { X, RotateCcw, Send,Undo2, KeyRound, CheckCircle2, Phone, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { db } from '../../firebase'
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { sendSms } from '../../services/pushbullet'
import { checkPasswordMatch, doPasswordsMatch } from '../checker/passwordChecker'

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function ForgotPasswordModal({ isOpen = false, onClose }) {
  const [contact, setContact] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sentCode, setSentCode] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeSuccess, setCodeSuccess] = useState('')
  const [sendingCode, setSendingCode] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [matchedUserId, setMatchedUserId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [checkingContact, setCheckingContact] = useState(false)
  const [contactNotFound, setContactNotFound] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setContact('')
      setCodeSent(false)
      setSentCode('')
      setVerificationCode('')
      setCodeError('')
      setCodeSuccess('')
      setSendingCode(false)
      setIsVerified(false)
      setMatchedUserId('')
      setNewPassword('')
      setConfirmPassword('')
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      setPasswordError('')
      setPasswordResetSuccess(false)
      setSavingPassword(false)
      setCheckingContact(false)
      setContactNotFound(false)
    }
  }, [isOpen])

  const isContactValid = contact.startsWith('+63') && contact.length === 13 && /^\+63\d{10}$/.test(contact)

  useEffect(() => {
    if (!isOpen || !isContactValid) {
      setContactNotFound(false)
      setCheckingContact(false)
      return
    }

    let isCancelled = false
    setCheckingContact(true)
    setContactNotFound(false)

    async function verifyContact() {
      try {
        const snap = await getDocs(collection(db, 'users'))
        if (isCancelled) return

        const enteredDigits = contact.replace(/\D/g, '')
        let normalizedEntered = contact
        if (enteredDigits.startsWith('63')) {
          normalizedEntered = '+' + enteredDigits
        } else if (enteredDigits.startsWith('09')) {
          normalizedEntered = '+63' + enteredDigits.slice(1)
        } else if (enteredDigits.length === 10 && enteredDigits.startsWith('9')) {
          normalizedEntered = '+63' + enteredDigits
        }

        const found = snap.docs.find((d) => {
          const data = d.data()
          const c = (data.contact || '').trim()
          const cDigits = c.replace(/\D/g, '')
          let normalizedC = c
          if (cDigits.startsWith('63')) {
            normalizedC = '+' + cDigits
          } else if (cDigits.startsWith('09')) {
            normalizedC = '+63' + cDigits.slice(1)
          } else if (cDigits.length === 10 && cDigits.startsWith('9')) {
            normalizedC = '+63' + cDigits
          }

          return (c && (c === contact || c === normalizedEntered)) ||
            (cDigits && enteredDigits && cDigits === enteredDigits) ||
            (normalizedC && normalizedEntered && normalizedC === normalizedEntered)
        })

        if (!found) {
          setContactNotFound(true)
          setMatchedUserId('')
        } else {
          setContactNotFound(false)
          setMatchedUserId(found.id)
        }
      } catch {
        if (!isCancelled) {
          setContactNotFound(false)
        }
      } finally {
        if (!isCancelled) {
          setCheckingContact(false)
        }
      }
    }

    verifyContact()

    return () => {
      isCancelled = true
    }
  }, [isOpen, contact, isContactValid])

  if (!isOpen) return null

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
    setContactNotFound(false)
    setCheckingContact(false)
    if (codeSent) {
      setCodeSent(false)
      setSentCode('')
      setVerificationCode('')
      setCodeError('')
      setCodeSuccess('')
    }
  }

  function getContactProblem() {
    if (!contact) return ''
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

  async function handleSendCode() {
    if (!isContactValid || contactNotFound || checkingContact) return
    setSendingCode(true)
    setCodeError('')
    try {
      const snap = await getDocs(collection(db, 'users'))
      const enteredDigits = contact.replace(/\D/g, '')
      const found = snap.docs.find((d) => {
        const data = d.data()
        const c = (data.contact || '').trim()
        return c === contact || (c.replace(/\D/g, '') && c.replace(/\D/g, '') === enteredDigits)
      })
      if (!found) {
        setCodeError('No account found with this contact number.')
        setSendingCode(false)
        return
      }
      setMatchedUserId(found.id)
    } catch {}

    const generated = Math.floor(100000 + Math.random() * 900000).toString()
    setSentCode(generated)
    setCodeSent(true)
    setCodeSuccess('Verification code has been sent to your contact number.')
    try {
      await sendSms(contact, `Your EcoBin verification code is: ${generated}`)
    } catch {}
    setSendingCode(false)
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
    setIsVerified(true)
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setPasswordError('')
    const check = checkPasswordMatch(newPassword, confirmPassword)
    if (!check.isValid) {
      setPasswordError(check.error)
      return
    }
    setSavingPassword(true)
    try {
      const hashedPassword = await sha256(newPassword)
      let docId = matchedUserId
      if (!docId) {
        const snap = await getDocs(collection(db, 'users'))
        const enteredDigits = contact.replace(/\D/g, '')
        const found = snap.docs.find((d) => {
          const data = d.data()
          const c = (data.contact || '').trim()
          return c === contact || (c.replace(/\D/g, '') && c.replace(/\D/g, '') === enteredDigits)
        })
        if (found) docId = found.id
      }
      if (docId) {
        await updateDoc(doc(db, 'users', docId), {
          password: hashedPassword,
          updatedAt: serverTimestamp()
        })
        setSavingPassword(false)
        setPasswordResetSuccess(true)
      } else {
        setPasswordError('User account not found for this contact number.')
        setSavingPassword(false)
      }
    } catch (err) {
      setPasswordError('Failed to update password: ' + (err.message || 'Please check your connection.'))
      setSavingPassword(false)
    }
  }

  const handleClose = () => {
    if (onClose) onClose()
  }

  if (isVerified) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
        <div className="w-[450px] bg-white rounded border border-slate-200 shadow-2xl p-6 sm:p-7 relative">
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>

          <div className="flex gap-3.5 items-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div className="flex flex-col">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Set New Password
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Enter your new password and confirm it below.
              </p>
            </div>
          </div>

          {passwordResetSuccess ? (
            <div className="mt-5 p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-emerald-900">
                Password Reset Successfully!
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                Your password has been updated. You can now sign in with your new credentials.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="mt-4 py-2 px-2 m-auto flex items-center justify-center gap-1 text-sm sm:text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
              >
                <Undo2 size={18} />
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
              {passwordError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {passwordError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
                  Enter New Password
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                    }}
                    placeholder="Confirm new password"
                    className="w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="py-2 px-2 flex items-center justify-center gap-1 text-sm font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-60"
                >
                  <RotateCcw size={18} />
                  {savingPassword ? 'Updating...' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="py-2 px-2 flex items-center gap-1 text-sm font-semibold rounded bg-slate-500 hover:bg-slate-600 transition cursor-pointer"
                >
                  <X size={18} />
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="w-[450px] bg-white rounded border border-slate-200 shadow-2xl p-6 sm:p-7 relative">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <div className="flex gap-3.5 items-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
            <KeyRound className="w-7 h-7" />
          </div>

          <div className="flex flex-col">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Reset Password
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Enter your registered contact number to receive a verification code.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 tracking-wider mb-1.5">
              Contact Number
            </label>
            <div className="flex gap-1 items-center">
              <div className="relative" style={{ flexGrow: 1 }}>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
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
                  style={{ paddingTop: '7px', paddingBottom: '7px', minWidth: '100%', fontSize: '14px'}}
                  className="pl-9 rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-slate-50 font-mono"
                />
              </div>
              {isContactValid && (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || checkingContact || contactNotFound}
                  className="rounded flex items-center gap-1 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                  style={{fontSize: '14px', padding: '8px', paddingRight:'7px',paddingLeft: '7px', minWidth: 'max-content', whiteSpace: 'nowrap'}}
                >
                  <Send size={18} className="shrink-0" /> <span style={{maxWidth: '100%'}}>{sendingCode ? 'Sending...' : (checkingContact ? 'Checking...' : (codeSent ? 'Resend Code' : 'Send Code'))}</span>
                </button>
              )}
            </div>
            {getContactProblem() ? (
              <p className="text-[11px] text-rose-500 mt-1 font-medium">
                {getContactProblem()}
              </p>
            ) : contactNotFound ? (
              <p className="text-[11px] text-rose-500 mt-1 font-medium">
                Contact number does not exist.
              </p>
            ) : null}
          </div>

          {codeSent && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
              <label className="block text-xs font-bold text-slate-700 tracking-wider">
                Enter 6-Digit Code
              </label>
              <div className="flex gap-1 items-center">
                <div className="relative" style={{ flexGrow: 1 }}>
                  <input
                    type="text"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit code"
                    style={{ paddingTop: '7px', paddingBottom: '7px', minWidth: '100%', fontSize: '14px'}}
                    className="px-3 rounded border border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 bg-slate-50 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={verificationCode.length !== 6}
                  className="rounded flex items-center justify-center gap-1 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{fontSize: '14px', padding: '8px', minWidth: '130px'}}
                >
                  <ShieldCheck size={18} /> <span>Verify Code</span>
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

          <div className="flex items-center justify-end pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="py-2 px-2 flex items-center gap-1 text-sm font-semibold rounded bg-slate-500 hover:bg-slate-600 transition cursor-pointer"
            >
              <X size={18} />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
