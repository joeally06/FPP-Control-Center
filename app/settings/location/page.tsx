import AdminLayout from '@/components/AdminLayout';
import LocationRestrictions from '@/components/admin/LocationRestrictions';

export default function LocationSettingsPage() {
  return (
    <AdminLayout>
      <LocationRestrictions />
    </AdminLayout>
  );
}
