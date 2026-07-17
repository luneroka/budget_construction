import { type FormEvent, useId, useState } from 'react'
import { Mail } from 'lucide-react'

import { getApiErrorMessage } from '@/api/client'
import { useSendContactRequestMutation } from '@/api/contactRequests'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { notifyError, notifySuccess } from '@/lib/toasts'

import { ModalCancelButton, ModalSaveButton, ModalShell } from './ModalShell'

export function ContactOwnerDialog() {
  const formId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const sendContactRequestMutation = useSendContactRequestMutation()
  const busy = sendContactRequestMutation.isPending

  function resetForm() {
    setName('')
    setEmail('')
    setReason('')
    setMessage('')
    setWebsite('')
  }

  function closeDialog() {
    if (busy) return
    setIsOpen(false)
    resetForm()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await sendContactRequestMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        reason: reason.trim(),
        message: message.trim(),
        website,
      })
      notifySuccess('Votre message a bien été envoyé.')
      setIsOpen(false)
      resetForm()
    } catch (error) {
      notifyError(getApiErrorMessage(error))
    }
  }

  return (
    <>
      <button
        type="button"
        className="mt-6 block w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
        onClick={() => setIsOpen(true)}
      >
        Vous souhaitez essayer l’application&nbsp;? <br />
        Contactez le propriétaire
      </button>

      {isOpen ? (
        <ModalShell
          title="Contacter le propriétaire"
          subtitle="Présentez-vous et dites-nous pourquoi vous souhaitez essayer l’application."
          icon={<Mail className="h-5 w-5" aria-hidden="true" />}
          closeDisabled={busy}
          onClose={closeDialog}
          footer={
            <>
              <ModalCancelButton onClick={closeDialog} disabled={busy} />
              <ModalSaveButton
                type="submit"
                form={formId}
                isSaving={busy}
                savingLabel="Envoi..."
              >
                Envoyer
              </ModalSaveButton>
            </>
          }
        >
          <form id={formId} className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="contact-name">Nom</Label>
              <Input
                id="contact-name"
                autoComplete="name"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-reason">Raison du contact</Label>
              <Input
                id="contact-reason"
                value={reason}
                disabled={busy}
                placeholder="Ex : essayer l’application pour mon projet de rénovation"
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-message">Message</Label>
              <Textarea
                id="contact-message"
                value={message}
                disabled={busy}
                placeholder="Parlez-nous de votre projet..."
                className="min-h-28 resize-none"
                onChange={(event) => setMessage(event.target.value)}
                required
              />
            </div>

            {/* Honeypot: hidden from real users, only bots fill it in. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="contact-website">Ne pas remplir ce champ</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>
          </form>
        </ModalShell>
      ) : null}
    </>
  )
}
