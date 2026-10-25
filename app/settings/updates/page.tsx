import AdminLayout from '@/components/AdminLayout';
import UpdateChecker from '@/components/UpdateChecker';
import { card } from '@/components/admin/ui-classes';

export default function UpdateSettingsPage() {
  return (
    <AdminLayout>
      <div className={`${card} max-w-3xl`}>
        <UpdateChecker />
      </div>
    </AdminLayout>
  );
}
