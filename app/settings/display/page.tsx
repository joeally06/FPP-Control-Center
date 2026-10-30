import AdminLayout from '@/components/AdminLayout';
import DisplaySettings from '@/components/admin/DisplaySettings';

export default async function DisplaySettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await searchParams;
  return (
    <AdminLayout>
      <DisplaySettings initialTab={typeof tab === 'string' ? tab : undefined} />
    </AdminLayout>
  );
}
