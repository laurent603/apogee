import { redirect } from 'next/navigation'

/**
 * Le Dashboard a fusionné avec le Cockpit.
 *
 * Les deux pages montraient les mêmes totaux, la même tendance journalière et
 * la même répartition par campagne — laquelle refaisait déjà le tableau de
 * pilotage. Seuls les derniers lancements étaient propres au Dashboard : ils
 * ont suivi dans le cockpit.
 *
 * La route reste, parce que des liens et le retour de connexion y mènent.
 */
export default function DashboardRedirige() {
  redirect('/cockpit')
}
