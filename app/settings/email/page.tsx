import { prisma } from '@/lib/db';
import { DEFAULT_EMAIL_TEMPLATE } from '@/lib/email';
import EmailTemplateClient from '@/components/settings/EmailTemplateClient';

export const dynamic = 'force-dynamic';

export default async function EmailTemplateSettingsPage() {
  let initial = { ...DEFAULT_EMAIL_TEMPLATE };
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { id: 'default' } });
    if (row) initial = { subject: row.subject, intro: row.intro, closing: row.closing };
  } catch {}

  return (
    <div className="px-8 py-8 space-y-6">
      <EmailTemplateClient initial={initial} defaults={DEFAULT_EMAIL_TEMPLATE} />
    </div>
  );
}
