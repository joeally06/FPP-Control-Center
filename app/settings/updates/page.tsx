import AdminLayout from '@/components/AdminLayout';
import UpdateChecker from '@/components/UpdateChecker';

export default function UpdateSettingsPage() {
  return (
    <AdminLayout>
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <UpdateChecker />
      </div>
    </AdminLayout>
  );
}
