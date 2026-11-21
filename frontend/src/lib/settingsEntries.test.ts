import { describe, expect, it } from 'vitest'

import { settingsEntries } from '@/lib/settingsEntries'

describe('settingsEntries', () => {
  it('shows the lots entry next to user management to admins', () => {
    const ids = settingsEntries(true).map((entry) => entry.id)

    expect(ids).toContain('users')
    expect(ids.indexOf('lots')).toBe(ids.indexOf('users') + 1)
    expect(settingsEntries(true).find((entry) => entry.id === 'lots')?.to).toBe(
      '/settings/lots',
    )
  })

  it('hides the admin entries from everyone else', () => {
    const ids = settingsEntries(false).map((entry) => entry.id)

    expect(ids).not.toContain('lots')
    expect(ids).not.toContain('users')
    expect(ids).toEqual(['user', 'projects', 'exports'])
  })
})
