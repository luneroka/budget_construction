const FRENCH_COUNTRY_CODE = '+33'
const INTERNATIONAL_COUNTRY_CODES = [
  '+1',
  '+7',
  '+20',
  '+27',
  '+30',
  '+31',
  '+32',
  '+33',
  '+34',
  '+36',
  '+39',
  '+40',
  '+41',
  '+43',
  '+44',
  '+45',
  '+46',
  '+47',
  '+48',
  '+49',
  '+51',
  '+52',
  '+53',
  '+54',
  '+55',
  '+56',
  '+57',
  '+58',
  '+60',
  '+61',
  '+62',
  '+63',
  '+64',
  '+65',
  '+66',
  '+81',
  '+82',
  '+84',
  '+86',
  '+90',
  '+91',
  '+92',
  '+93',
  '+94',
  '+95',
  '+98',
  '+212',
  '+213',
  '+216',
  '+218',
  '+220',
  '+221',
  '+222',
  '+223',
  '+224',
  '+225',
  '+226',
  '+227',
  '+228',
  '+229',
  '+230',
  '+231',
  '+232',
  '+233',
  '+234',
  '+235',
  '+236',
  '+237',
  '+238',
  '+239',
  '+240',
  '+241',
  '+242',
  '+243',
  '+244',
  '+245',
  '+246',
  '+248',
  '+249',
  '+250',
  '+251',
  '+252',
  '+253',
  '+254',
  '+255',
  '+256',
  '+257',
  '+258',
  '+260',
  '+261',
  '+262',
  '+263',
  '+264',
  '+265',
  '+266',
  '+267',
  '+268',
  '+269',
  '+290',
  '+291',
  '+297',
  '+298',
  '+299',
  '+350',
  '+351',
  '+352',
  '+353',
  '+354',
  '+355',
  '+356',
  '+357',
  '+358',
  '+359',
  '+370',
  '+371',
  '+372',
  '+373',
  '+374',
  '+375',
  '+376',
  '+377',
  '+378',
  '+380',
  '+381',
  '+382',
  '+383',
  '+385',
  '+386',
  '+387',
  '+389',
  '+420',
  '+421',
  '+423',
  '+500',
  '+501',
  '+502',
  '+503',
  '+504',
  '+505',
  '+506',
  '+507',
  '+508',
  '+509',
  '+590',
  '+591',
  '+592',
  '+593',
  '+594',
  '+595',
  '+596',
  '+597',
  '+598',
  '+599',
  '+670',
  '+672',
  '+673',
  '+674',
  '+675',
  '+676',
  '+677',
  '+678',
  '+679',
  '+680',
  '+681',
  '+682',
  '+683',
  '+685',
  '+686',
  '+687',
  '+688',
  '+689',
  '+690',
  '+691',
  '+692',
  '+850',
  '+852',
  '+853',
  '+855',
  '+856',
  '+880',
  '+886',
  '+960',
  '+961',
  '+962',
  '+963',
  '+964',
  '+965',
  '+966',
  '+967',
  '+968',
  '+970',
  '+971',
  '+972',
  '+973',
  '+974',
  '+975',
  '+976',
  '+977',
  '+992',
  '+993',
  '+994',
  '+995',
  '+996',
  '+998',
].sort((left, right) => right.length - left.length)

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function detectCountryCode(value: string): string | null {
  if (!value.startsWith('+')) return null

  return (
    INTERNATIONAL_COUNTRY_CODES.find(
      (countryCode) =>
        value.startsWith(countryCode) && value.length > countryCode.length,
    ) ?? null
  )
}

export function normalizePhoneNumber(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') return null

  const hasLeadingPlus = trimmed.startsWith('+')
  const rest = hasLeadingPlus ? trimmed.slice(1) : trimmed
  if (rest.includes('+')) {
    throw new Error('Le + est uniquement autorisé au début du numéro.')
  }
  if (/\p{L}/u.test(rest)) {
    throw new Error(
      'Le téléphone ne peut contenir que des chiffres et de la ponctuation.',
    )
  }

  const normalized = `${hasLeadingPlus ? '+' : ''}${digitsOnly(rest)}`
  return normalized === '' || normalized === '+' ? null : normalized
}

export function normalizeCountryCode(value: string): string {
  const normalized = normalizePhoneNumber(value)
  if (normalized === null) return ''

  return normalized.startsWith('+') ? normalized : `+${normalized}`
}

export function splitPhoneNumber(value: string | null | undefined): {
  countryCode: string
  localNumber: string
} {
  let normalized: string | null
  try {
    normalized = normalizePhoneNumber(value)
  } catch {
    return { countryCode: '', localNumber: value?.trim() ?? '' }
  }

  if (normalized === null) {
    return { countryCode: FRENCH_COUNTRY_CODE, localNumber: '' }
  }

  const countryCode = detectCountryCode(normalized)
  if (countryCode !== null) {
    return {
      countryCode,
      localNumber: normalized.slice(countryCode.length),
    }
  }

  if (normalized.startsWith('+')) {
    return { countryCode: '', localNumber: normalized }
  }

  return { countryCode: '', localNumber: normalized }
}

export function buildPhoneNumber(
  countryCode: string,
  localNumber: string,
): string | null {
  const normalizedLocal = normalizePhoneNumber(localNumber)
  if (normalizedLocal === null) return null

  if (normalizedLocal.startsWith('+')) return normalizedLocal

  const normalizedCountryCode = normalizeCountryCode(countryCode)
  if (normalizedCountryCode === '') return normalizedLocal

  const localDigits = digitsOnly(normalizedLocal).replace(/^0+/, '')
  return localDigits === '' ? null : `${normalizedCountryCode}${localDigits}`
}

function groupPairs(value: string): string {
  if (value.length <= 2) return value

  const groups: string[] = []
  let index = value.length % 2 === 0 ? 0 : 1

  if (index === 1) groups.push(value.slice(0, 1))

  for (; index < value.length; index += 2) {
    groups.push(value.slice(index, index + 2))
  }

  return groups.join(' ')
}

export function formatPhoneNumber(value: string | null | undefined): string {
  let normalized: string | null
  try {
    normalized = normalizePhoneNumber(value)
  } catch {
    return value?.trim() || '-'
  }

  if (normalized === null) return '-'

  if (normalized.startsWith('+')) {
    const countryCode = detectCountryCode(normalized)
    if (countryCode === null) return normalized

    return `${countryCode} ${groupPairs(normalized.slice(countryCode.length))}`
  }

  return groupPairs(normalized)
}
