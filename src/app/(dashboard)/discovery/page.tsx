import { redirect } from 'next/navigation'

/** Discovery est devenu l'onglet « Toutes les pubs » de la Bibliothèque. */
export default function Discovery() {
  redirect('/bibliotheque')
}
