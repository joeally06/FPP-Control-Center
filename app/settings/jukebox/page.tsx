import AdminLayout from '@/components/AdminLayout';
import JukeboxSetup from '@/components/admin/JukeboxSetup';

export default async function JukeboxSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await searchParams;
  return (
    <AdminLayout>
      <JukeboxSetup initialTab={typeof tab === 'string' ? tab : undefined} />
    </AdminLayout>
  );
}
