import { redirect } from 'next/navigation';

/** @deprecated Use `/settings/extensions` */
export default function LegacyMcpExtensionsSettingsRedirect() {
  redirect('/settings/extensions');
}
