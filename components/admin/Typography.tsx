import React from 'react';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
}

interface LabelProps extends TypographyProps {
  htmlFor?: string;
}

/**
 * Admin Panel Typography Components
 * Ensures consistent font styling across all admin pages
 * Uses CSS variables from globals.css for consistent theming
 */

// ===== HEADINGS =====

/**
 * Page Title (H1)
 * Usage: Main page headings
 * Color: adm-text, Size: 2xl-3xl, Weight: Semibold
 */
export const AdminH1 = ({ children, className = '' }: TypographyProps) => (
  <h1 className={`admin-h1 ${className}`}>
    {children}
  </h1>
);

/**
 * Section Title (H2)
 * Usage: Major section headings
 * Color: adm-text, Size: lg, Weight: Semibold
 */
export const AdminH2 = ({ children, className = '' }: TypographyProps) => (
  <h2 className={`admin-h2 ${className}`}>
    {children}
  </h2>
);

/**
 * Subsection Title (H3)
 * Usage: Subsection headings
 * Color: adm-text, Size: 15px, Weight: Semibold
 */
export const AdminH3 = ({ children, className = '' }: TypographyProps) => (
  <h3 className={`admin-h3 ${className}`}>
    {children}
  </h3>
);

/**
 * Card/Small Section Title (H4)
 * Usage: Card headers, small sections
 * Color: adm-text, Size: 15px, Weight: Semibold
 */
export const AdminH4 = ({ children, className = '' }: TypographyProps) => (
  <h4 className={`text-[15px] font-semibold mb-2 text-adm-text ${className}`}>
    {children}
  </h4>
);

// ===== BODY TEXT =====

/**
 * Body Text
 * Usage: Default paragraph text
 * Color: soft grey (--admin-text-secondary), Size: 15px
 */
export const AdminText = ({ children, className = '' }: TypographyProps) => (
  <p className={`admin-text ${className}`}>
    {children}
  </p>
);

/**
 * Muted Text
 * Usage: Helper text, descriptions, captions
 * Color: muted grey (--admin-text-muted), Size: sm
 */
export const AdminTextMuted = ({ children, className = '' }: TypographyProps) => (
  <p className={`admin-text-muted ${className}`}>
    {children}
  </p>
);

/**
 * Small Text
 * Usage: Very small helper text
 * Color: muted grey (--admin-text-muted), Size: sm
 * Alias for AdminTextMuted for semantic clarity
 */
export const AdminTextSmall = AdminTextMuted;

/**
 * Tiny Text
 * Usage: Extremely small labels, timestamps
 * Color: adm-faint, Size: xs
 */
export const AdminTextTiny = ({ children, className = '' }: TypographyProps) => (
  <p className={`text-xs text-adm-faint ${className}`}>
    {children}
  </p>
);

// ===== LABELS =====

/**
 * Form Label
 * Usage: Labels for form inputs
 * Color: soft grey (--admin-text-secondary), Size: 13px, Weight: Medium
 */
export const AdminLabel = ({ children, className = '', htmlFor }: LabelProps) => (
  <label htmlFor={htmlFor} className={`admin-label ${className}`}>
    {children}
  </label>
);

// ===== VALUES & STATS =====

/**
 * Large Value Display
 * Usage: Statistics, metrics, big numbers
 * Color: adm-text, Size: 3xl, Weight: Semibold
 */
export const AdminValue = ({ children, className = '' }: TypographyProps) => (
  <div className={`text-3xl font-semibold text-adm-text ${className}`}>
    {children}
  </div>
);

/**
 * Medium Value Display
 * Usage: Smaller stats
 * Color: adm-text, Size: 2xl, Weight: Semibold
 */
export const AdminValueMedium = ({ children, className = '' }: TypographyProps) => (
  <div className={`text-2xl font-semibold text-adm-text ${className}`}>
    {children}
  </div>
);

// ===== MESSAGE STATES =====

/**
 * Success Message
 * Usage: Success notifications
 * Color: adm-ok, Size: sm
 */
export const AdminSuccess = ({ children, className = '' }: TypographyProps) => (
  <p className={`text-adm-ok text-sm ${className}`}>
    {children}
  </p>
);

/**
 * Error Message
 * Usage: Error notifications
 * Color: adm-danger, Size: sm
 */
export const AdminError = ({ children, className = '' }: TypographyProps) => (
  <p className={`text-adm-danger text-sm ${className}`}>
    {children}
  </p>
);

/**
 * Warning Message
 * Usage: Warning notifications
 * Color: adm-warn, Size: sm
 */
export const AdminWarning = ({ children, className = '' }: TypographyProps) => (
  <p className={`text-adm-warn text-sm ${className}`}>
    {children}
  </p>
);

/**
 * Info Message
 * Usage: Informational notifications
 * Color: adm-info, Size: sm
 */
export const AdminInfo = ({ children, className = '' }: TypographyProps) => (
  <p className={`text-adm-info text-sm ${className}`}>
    {children}
  </p>
);

// ===== LAYOUT COMPONENTS =====

/**
 * Card Container
 * Usage: Card wrapper (dark surface)
 */
export const AdminCard = ({ children, className = '' }: TypographyProps) => (
  <div className={`admin-card ${className}`}>
    {children}
  </div>
);

/**
 * Section Container
 * Usage: Section wrapper with bottom margin
 */
export const AdminSection = ({ children, className = '' }: TypographyProps) => (
  <div className={`admin-section ${className}`}>
    {children}
  </div>
);
