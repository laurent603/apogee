import { redirect } from 'next/navigation'

/**
 * L'ancien Dashboard a fusionné avec le Cockpit, qui s'appelle désormais
 * Dashboard à l'écran — la route, elle, est restée `/cockpit`.
 *
 * Les deux pages montraient les mêmes totaux, la même tendance journalière et
 * la même répartition par campagne. Seuls les derniers lancements étaient
 * propres au Dashboard : ils ont suivi.
 *
 * Cette route reste en place parce que des liens et le retour de connexion y
 * mènent encore.
 */
export default function DashboardRedirige() {
  redirect('/cockpit')
}
