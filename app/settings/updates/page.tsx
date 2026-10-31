import AdminLayout from '@/components/AdminLayout';
import UpdateChecker from '@/components/UpdateChecker';
import RestartServices from '@/components/RestartServices';
import DependencyReport from '@/components/DependencyReport';
import { card } from '@/components/admin/ui-classes';

export default function UpdateSettingsPage() {
  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-5">
        <div className={card}>
          <UpdateChecker />
        </div>
        <div className={card}>
          <RestartServices />
        </div>
        <div className={card}>
          <DependencyReport />
        </div>
      </div>
    </AdminLayout>
  );
}
