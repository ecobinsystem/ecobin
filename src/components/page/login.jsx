import React, { useState } from 'react'
import {
  Lock,
  Eye,
  EyeOff,
  Phone,
  ArrowRight,
  AlertCircle
} from 'lucide-react'
import logo from '../../public/img/logo.png'
import { db } from '../../firebase'
import { collection, getDocs } from 'firebase/firestore'
import ForgotPasswordModal from '../modal/ForgotPasswordModal'
import { checkContactNumber } from '../checker/contactChecker'

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function Login({ onLogin, onForgotPassword }) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForgotModal, setShowForgotModal] = useState(false)

  const handleContactChange = (e) => {
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
    setIdentifier(val)
    if (error) setError('')
  }

  const getContactFieldError = () => {
    if (!identifier) return ''
    const val = identifier.trim()
    if (!val.startsWith('+63') && !val.startsWith('09')) {
      return 'Must start with 09 or +63'
    }
    if (val.startsWith('+63')) {
      if (!/^\+63\d*$/.test(val)) {
        return 'Must contain only digits after +63'
      }
      if (val.length < 13) {
        return `Must be 13 digits for +63 (${val.length}/13)`
      }
    }
    if (val.startsWith('09')) {
      if (!/^09\d*$/.test(val)) {
        return 'Must contain only digits'
      }
      if (val.length < 11) {
        return `Must be 11 digits for 09 (${val.length}/11)`
      }
    }
    return ''
  }

  const contactFieldError = getContactFieldError()

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const entered = identifier.trim()
    if (!entered) {
      setError('Please enter your contact number.')
      return
    }

    const contactCheck = checkContactNumber(entered)
    if (!contactCheck.isValid) {
      setError(contactCheck.error)
      return
    }

    if (!password) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)

    try {
      const snap = await getDocs(collection(db, 'users'))
      if (snap.empty) {
        setError('No user accounts found in Firestore.')
        setLoading(false)
        return
      }

      const enteredDigits = entered.replace(/\D/g, '')
      let normalizedEntered = entered
      if (enteredDigits.startsWith('63')) {
        normalizedEntered = '+' + enteredDigits
      } else if (enteredDigits.startsWith('09')) {
        normalizedEntered = '+63' + enteredDigits.slice(1)
      } else if (enteredDigits.length === 10 && enteredDigits.startsWith('9')) {
        normalizedEntered = '+63' + enteredDigits
      }

      const foundDoc = snap.docs.find((d) => {
        const data = d.data()
        const docContact = (data.contact || '').trim()
        const docContactDigits = docContact.replace(/\D/g, '')

        return (docContact && (docContact === entered || docContact === normalizedEntered)) ||
          (docContactDigits && enteredDigits && docContactDigits === enteredDigits)
      })

      if (!foundDoc) {
        setError('Account not found. Please check your contact number.')
        setLoading(false)
        return
      }

      const userData = foundDoc.data()
      const role = String(userData.role || '').toLowerCase().trim()
      if (role !== 'admin') {
        setError('Access denied. Only admin roles are allowed to login.')
        setLoading(false)
        return
      }

      const hashedInput = await sha256(password)
      if (userData.password !== hashedInput) {
        setError('Incorrect password. Please try again.')
        setLoading(false)
        return
      }

      setLoading(false)
      if (onLogin) {
        onLogin({
          id: foundDoc.id,
          identifier: entered,
          contact: userData.contact || entered,
          name: userData.name || foundDoc.id,
          role: userData.role
        })
      }
    } catch (err) {
      setError('Authentication error: ' + (err.message || 'Unable to connect to Firestore.'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 select-none">
      <div className="w-full max-w-md rounded-xl shadow-lg shadow-slate-500">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8">
          <div className="text-center mb-6">
            <img src={logo} alt="EcoBin Logo" className="w-32 h-32 object-contain mx-auto mb-2" />
            <p className="font-semibold text-slate-500 mt-0.5 mb-5">
              Smart Waste Segregation Monitoring and Collection System
            </p>
            <p className="mt-5 text-sm text-slate-500 mt-0.5">
              Enter your credentials to access the system
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className='mb-4'>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Contact Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4 text-emerald-600" />
                </div>
                <input
                  type="tel"
                  value={identifier}
                  onChange={handleContactChange}
                  maxLength={identifier.startsWith('0') ? 11 : 13}
                  placeholder="e.g. +639123456789 or 09123456789"
                  autoComplete="tel"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 transition placeholder:text-slate-400 font-medium font-mono"
                />
              </div>
              {contactFieldError && (
                <p className="text-[11px] text-rose-500 mt-1 font-medium">
                  {contactFieldError}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (onForgotPassword) {
                      onForgotPassword()
                    } else {
                      setShowForgotModal(true)
                    }
                  }}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline transition"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-800 transition placeholder:text-slate-400 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 py-2 px-2 m-auto flex items-center justify-center w-full gap-1 text-sm sm:text-sm font-bold rounded bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

      </div>

      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
      />
    </div>
  )
}
