// The cards of the Paramètres page. User management and the global lots are
// admin-only: a non-admin never sees their entries (the API answers 403
// anyway).
export type SettingsEntryId = 'user' | 'projects' | 'exports' | 'users' | 'lots'

export type SettingsEntry = {
  id: SettingsEntryId
  to: string
  title: string
  description: string
  linkLabel: string
}

const entries: Array<SettingsEntry & { adminOnly?: boolean }> = [
  {
    id: 'user',
    to: '/settings/user',
    title: 'Paramètres utilisateur',
    description: 'Compte, email et sécurité.',
    linkLabel: 'Ouvrir les paramètres utilisateur',
  },
  {
    id: 'projects',
    to: '/settings/projects',
    title: 'Projets',
    description: 'Gestion des projets.',
    linkLabel: 'Ouvrir la gestion des projets',
  },
  {
    id: 'exports',
    to: '/settings/exports',
    title: 'Exports',
    description: 'Fichiers comptables et rapports du projet.',
    linkLabel: 'Ouvrir les exports',
  },
  {
    id: 'users',
    to: '/settings/users',
    title: 'Utilisateurs',
    description: 'Invitations, accès et comptes (administrateur).',
    linkLabel: 'Ouvrir la gestion des utilisateurs',
    adminOnly: true,
  },
  {
    id: 'lots',
    to: '/settings/lots',
    title: 'Lots',
    description:
      'Noms et ordre des lots communs à tous les projets (administrateur).',
    linkLabel: 'Ouvrir la gestion des lots',
    adminOnly: true,
  },
]

export function settingsEntries(isAdmin: boolean): SettingsEntry[] {
  return entries
    .filter((entry) => isAdmin || !entry.adminOnly)
    .map(({ adminOnly: _adminOnly, ...entry }) => entry)
}
