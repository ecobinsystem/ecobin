export function isValidContactNumber(contact) {
  const value = String(contact ?? '').trim()

  if (value.startsWith('+63')) {
    return value.length === 13 && /^\+63\d{10}$/.test(value)
  }

  if (value.startsWith('09')) {
    return value.length === 11 && /^09\d{9}$/.test(value)
  }

  return false
}

export function checkContactNumber(contact) {
  const value = String(contact ?? '').trim()

  if (!value) {
    return {
      isValid: false,
      error: 'Contact number is required.'
    }
  }

  if (!value.startsWith('+63') && !value.startsWith('09')) {
    return {
      isValid: false,
      error: 'Contact number must start with +63 or 09.'
    }
  }

  if (value.startsWith('+63')) {
    if (value.length !== 13) {
      return {
        isValid: false,
        error: 'Contact number starting with +63 must have exactly 13 characters.'
      }
    }
    if (!/^\+63\d{10}$/.test(value)) {
      return {
        isValid: false,
        error: 'Contact number starting with +63 must contain only digits after +.'
      }
    }
    return {
      isValid: true,
      error: ''
    }
  }

  if (value.startsWith('09')) {
    if (value.length !== 11) {
      return {
        isValid: false,
        error: 'Contact number starting with 09 must have exactly 11 digits.'
      }
    }
    if (!/^09\d{9}$/.test(value)) {
      return {
        isValid: false,
        error: 'Contact number starting with 09 must contain only digits.'
      }
    }
    return {
      isValid: true,
      error: ''
    }
  }

  return {
    isValid: false,
    error: 'Invalid contact number.'
  }
}

export const validateContactNumber = isValidContactNumber
export default isValidContactNumber
