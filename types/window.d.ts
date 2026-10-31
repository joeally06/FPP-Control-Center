export {};

declare global {
  interface Window {
    // Set by the cookie banner when the visitor declines analytics; useVisitorTracking checks it
    disableAnalytics?: boolean;
  }
}
