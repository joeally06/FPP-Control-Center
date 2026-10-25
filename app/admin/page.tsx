import { redirect } from 'next/navigation';

// Requests & votes analytics are now a view of /analytics; keeps old links and bookmarks working
export default function AdminAnalyticsRedirect() {
  redirect('/analytics?view=requests');
}
