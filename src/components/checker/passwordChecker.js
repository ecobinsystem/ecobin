export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function doPasswordsMatch(newPassword, confirmPassword) {
  if (!newPassword || !confirmPassword) {
    return false
  }
  return newPassword === confirmPassword
}

export function checkPasswordMatch(newPassword, confirmPassword) {
  if (!newPassword && !confirmPassword) {
    return {
      isValid: false,
      error: ''
    }
  }

  if (!newPassword) {
    return {
      isValid: false,
      error: 'Please enter a new password.'
    }
  }

  if (newPassword.length < 4) {
    return {
      isValid: false,
      error: 'Password must be at least 4 characters.'
    }
  }

  if (!confirmPassword) {
    return {
      isValid: false,
      error: 'Please confirm your new password.'
    }
  }

  if (newPassword !== confirmPassword) {
    return {
      isValid: false,
      error: 'Passwords do not match.'
    }
  }

  return {
    isValid: true,
    error: ''
  }
}

export async function checkCurrentPassword(enteredPassword, storedPasswordHash) {
  if (!enteredPassword) {
    return {
      isValid: false,
      error: 'Please enter your current password.'
    }
  }
  if (!storedPasswordHash) {
    return {
      isValid: false,
      error: 'Current password not found.'
    }
  }
  const enteredHashed = await sha256(enteredPassword)
  if (enteredHashed === storedPasswordHash || enteredPassword === storedPasswordHash) {
    return {
      isValid: true,
      error: ''
    }
  }
  return {
    isValid: false,
    error: 'Current password is incorrect.'
  }
}

export async function isCurrentPasswordCorrect(enteredPassword, storedPasswordHash) {
  if (!enteredPassword || !storedPasswordHash) return false
  const enteredHashed = await sha256(enteredPassword)
  return enteredHashed === storedPasswordHash || enteredPassword === storedPasswordHash
}

export const checkPassword = checkPasswordMatch
export const isPasswordMatch = doPasswordsMatch
export default checkPasswordMatch
