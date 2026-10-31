import 'jspdf';

// jspdf-autotable sets doc.lastAutoTable after drawing a table but does not declare it in its own types
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}
