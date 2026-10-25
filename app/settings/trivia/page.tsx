import AdminLayout from '@/components/AdminLayout';
import TriviaSettings from '@/components/admin/TriviaSettings';
import { AdminH2 } from '@/components/admin/Typography';
import { card } from '@/components/admin/ui-classes';

export default function TriviaSettingsPage() {
  return (
    <AdminLayout>
      <div className={card}>
        <AdminH2>Trivia</AdminH2>
        <TriviaSettings />
      </div>
    </AdminLayout>
  );
}
