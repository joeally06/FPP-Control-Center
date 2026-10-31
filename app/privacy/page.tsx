'use client';

import { formatDateTime } from '@/lib/time-utils';
import AdminNavigation from '@/components/AdminNavigation';
import { AdminH1, AdminH2, AdminH3, AdminText, AdminTextSmall } from '@/components/admin/Typography';

export default function PrivacyPage() {

  const handleResetCookies = () => {
    if (confirm('This will reset your cookie preferences and reload the page. Continue?')) {
      localStorage.removeItem('cookie-consent');
      window.location.reload();
    }
  };

  const getCurrentConsent = () => {
    if (typeof window === 'undefined') return null;
    const consent = localStorage.getItem('cookie-consent');
    return consent ? JSON.parse(consent) : null;
  };

  const consent = getCurrentConsent();

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900">
      <AdminNavigation />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <AdminH1 className="mb-8">🔒 Privacy Policy</AdminH1>

        <div className="space-y-6">
          {/* Last Updated */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminTextSmall className="text-white/70">
              Last Updated: November 5, 2025
            </AdminTextSmall>
          </div>

          {/* Introduction */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">Introduction</AdminH2>
            <AdminText className="mb-4">
              Welcome to FPP Control Center. We respect your privacy and are committed to protecting your 
              personal information. This Privacy Policy explains how we collect, use, and safeguard your data 
              when you use our Christmas light show control system.
            </AdminText>
            <AdminText>
              This is a personal/hobby project for managing Christmas light displays. We collect minimal data 
              necessary for the system to function and to provide you with the best experience.
            </AdminText>
          </div>

          {/* Information We Collect */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">📊 Information We Collect</AdminH2>
            
            <div className="space-y-4">
              <div>
                <AdminH3 className="mb-2">1. Automatically Collected Information</AdminH3>
                <ul className="space-y-2 text-white/80">
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-1">•</span>
                    <AdminText><strong>IP Addresses:</strong> Used for analytics, security, and to prevent abuse of the jukebox system</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-1">•</span>
                    <AdminText><strong>Browser Information:</strong> User agent, browser type, device type (for analytics and compatibility)</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-1">•</span>
                    <AdminText><strong>Page Views:</strong> Which pages you visit and when (for usage statistics)</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-400 mt-1">•</span>
                    <AdminText><strong>Timestamps:</strong> When you interact with the system</AdminText>
                  </li>
                </ul>
              </div>

              <div>
                <AdminH3 className="mb-2">2. Information You Provide</AdminH3>
                <ul className="space-y-2 text-white/80">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <AdminText><strong>Jukebox Requests:</strong> Song/sequence selections you make (anonymous, linked only to IP)</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <AdminText><strong>Admin Login:</strong> Google account email address (for admin authentication only)</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <AdminText><strong>Santa Letters:</strong> Names, ages, and wishes if you use the Letters to Santa feature (optional)</AdminText>
                  </li>
                </ul>
              </div>

              <div>
                <AdminH3 className="mb-2">3. Cookies and Local Storage</AdminH3>
                <ul className="space-y-2 text-white/80">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <AdminText><strong>Session Cookies:</strong> For admin authentication (NextAuth)</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <AdminText><strong>Preference Cookies:</strong> Theme settings, cookie consent choices</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <AdminText><strong>Local Storage:</strong> Temporary data for better user experience</AdminText>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* How We Use Your Information */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">🎯 How We Use Your Information</AdminH2>
            <ul className="space-y-2 text-white/80">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Operate the System:</strong> Process jukebox requests, manage light show sequences</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Analytics:</strong> Understand which features are popular, optimize performance</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Security:</strong> Prevent abuse, detect spam, protect admin areas</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Rate Limiting:</strong> Ensure fair usage of jukebox and Santa letter features</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Admin Authentication:</strong> Secure access to control panel (Google OAuth)</AdminText>
              </li>
            </ul>
          </div>

          {/* Data Sharing */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">🔐 Data Sharing and Third Parties</AdminH2>
            <div className="space-y-4">
              <AdminText className="text-green-300 font-semibold">
                ✅ We DO NOT sell your personal information to anyone.
              </AdminText>
              <AdminText className="text-green-300 font-semibold">
                ✅ We DO NOT share your data with advertisers or marketing companies.
              </AdminText>
              
              <div className="mt-4">
                <AdminH3 className="mb-2">Third-Party Services We Use:</AdminH3>
                <ul className="space-y-2 text-white/80">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <AdminText><strong>Google OAuth:</strong> For secure admin login only. Google&apos;s Privacy Policy applies.</AdminText>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-400 mt-1">•</span>
                    <AdminText><strong>Email Service:</strong> For sending Santa letter responses (if enabled). Email provider&apos;s policy applies.</AdminText>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Data Retention */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">🗄️ Data Retention</AdminH2>
            <ul className="space-y-2 text-white/80">
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <AdminText><strong>Analytics Data:</strong> Kept for current season, archived after Christmas</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <AdminText><strong>Jukebox Requests:</strong> Kept for current season, archived or deleted after</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <AdminText><strong>Santa Letters:</strong> Deleted after season ends (configurable)</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400 mt-1">•</span>
                <AdminText><strong>Admin Sessions:</strong> Expire after logout or 30 days of inactivity</AdminText>
              </li>
            </ul>
          </div>

          {/* Your Rights */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">⚖️ Your Rights</AdminH2>
            <AdminText className="mb-4">
              You have the right to:
            </AdminText>
            <ul className="space-y-2 text-white/80">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Access:</strong> Request a copy of your data</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Correction:</strong> Request correction of inaccurate data</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Deletion:</strong> Request deletion of your data (where feasible)</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Opt-Out:</strong> Disable analytics cookies via cookie settings below</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <AdminText><strong>Object:</strong> Object to processing of your data</AdminText>
              </li>
            </ul>
            <AdminText className="mt-4 text-white/70">
              To exercise these rights, please contact the site administrator.
            </AdminText>
          </div>

          {/* Cookie Settings */}
          <div id="cookie-settings" className="bg-linear-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-md rounded-lg p-6 border border-blue-500/30">
            <AdminH2 className="mb-4">🍪 Your Cookie Settings</AdminH2>
            
            {consent ? (
              <div className="space-y-4">
                <div className="bg-white/10 rounded-lg p-4">
                  <AdminText className="mb-3">Your current preferences:</AdminText>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <AdminTextSmall>Necessary Cookies:</AdminTextSmall>
                      <span className="text-green-400 font-semibold">✓ Always Active</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <AdminTextSmall>Analytics Cookies:</AdminTextSmall>
                      <span className={consent.analytics ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {consent.analytics ? '✓ Enabled' : '✗ Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <AdminTextSmall>Functional Cookies:</AdminTextSmall>
                      <span className={consent.functional ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {consent.functional ? '✓ Enabled' : '✗ Disabled'}
                      </span>
                    </div>
                  </div>
                  <AdminTextSmall className="text-white/50 mt-3">
                    Last updated: {formatDateTime(consent.timestamp, 'medium')}
                  </AdminTextSmall>
                </div>

                <button
                  onClick={handleResetCookies}
                  className="w-full px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all font-semibold"
                >
                  ⚙️ Change Cookie Preferences
                </button>
              </div>
            ) : (
              <div className="text-center">
                <AdminText className="mb-4">No cookie preferences saved yet.</AdminText>
                <button
                  onClick={handleResetCookies}
                  className="px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all font-semibold"
                >
                  Set Cookie Preferences
                </button>
              </div>
            )}
          </div>

          {/* Security */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">🛡️ Security</AdminH2>
            <AdminText className="mb-4">
              We take reasonable measures to protect your information:
            </AdminText>
            <ul className="space-y-2 text-white/80">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <AdminText>HTTPS encryption for all data transmission</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <AdminText>Secure session management with NextAuth</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <AdminText>Admin-only access to sensitive data and controls</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <AdminText>Rate limiting to prevent abuse</AdminText>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <AdminText>Regular security updates and monitoring</AdminText>
              </li>
            </ul>
            <AdminText className="mt-4 text-white/70">
              However, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security.
            </AdminText>
          </div>

          {/* Children's Privacy */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">👶 Children&apos;s Privacy</AdminH2>
            <AdminText className="mb-4">
              The FPP Control Center is a family-friendly Christmas light show control system. While we have a 
              &quot;Letters to Santa&quot; feature, we do not knowingly collect personal information from children under 13 
              without parental consent.
            </AdminText>
            <AdminText>
              Parents/guardians should supervise children&apos;s use of the Santa letter feature. If you believe we have 
              collected information from a child under 13 without consent, please contact us immediately.
            </AdminText>
          </div>

          {/* Changes to Policy */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">📝 Changes to This Policy</AdminH2>
            <AdminText>
              We may update this Privacy Policy from time to time. We will notify you of any changes by updating 
              the &quot;Last Updated&quot; date at the top of this policy. Continued use of the system after changes 
              constitutes acceptance of the updated policy.
            </AdminText>
          </div>

          {/* Contact */}
          <div className="bg-linear-to-r from-green-500/20 to-blue-500/20 backdrop-blur-md rounded-lg p-6 border border-green-500/30">
            <AdminH2 className="mb-4">📧 Contact Us</AdminH2>
            <AdminText className="mb-4">
              If you have questions about this Privacy Policy or wish to exercise your data rights, please contact:
            </AdminText>
            <div className="bg-white/10 rounded-lg p-4">
              <AdminText className="font-mono">
                FPP Control Center Administrator
              </AdminText>
              <AdminTextSmall className="text-white/70 mt-2">
                Use the contact information provided on the main site or admin dashboard.
              </AdminTextSmall>
            </div>
          </div>

          {/* Open Source Notice */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 border border-white/20">
            <AdminH2 className="mb-4">💻 Open Source</AdminH2>
            <AdminText>
              This is a personal/hobby project. The code is available on GitHub. By reviewing the code, 
              you can see exactly what data we collect and how it&apos;s used. Transparency is important to us.
            </AdminText>
          </div>
        </div>

        {/* Back to Top */}
        <div className="mt-8 text-center">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all font-semibold border border-white/30"
          >
            ↑ Back to Top
          </button>
        </div>
      </div>
    </div>
  );
}
