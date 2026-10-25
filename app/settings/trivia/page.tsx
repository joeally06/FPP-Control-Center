import AdminLayout from '@/components/AdminLayout';
import TriviaSettings from '@/components/admin/TriviaSettings';

export default function TriviaSettingsPage() {
  return (
    <AdminLayout>
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <TriviaSettings />
      </div>
    </AdminLayout>
  );
}
