import type { Metadata } from 'next';
import ConfirmSantaLetter from '@/components/ConfirmSantaLetter';

export const metadata: Metadata = {
  title: 'Confirm your letter to Santa',
  robots: { index: false, follow: false },
};

// Opened from the confirmation email. Confirming needs a button press (a POST), so mail
// scanners that pre-fetch links can't confirm a letter on the parent's behalf.
export default async function ConfirmSantaLetterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;
  return <ConfirmSantaLetter token={typeof token === 'string' ? token : ''} />;
}
