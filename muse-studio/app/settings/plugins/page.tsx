import { redirect } from 'next/navigation';

export default function PluginsSettingsRedirectPage() {
  redirect('/settings/extensions');
}
