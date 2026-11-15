'use client';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { localDateStamp } from '@/lib/analytics-time';

interface PdfReportData {
  generated: string;
  range: string;
  summary: { totalPageViews: number; totalVotes: number; totalSantaLetters: number };
  pageViews?: { page_path: string; view_time: string }[];
  votes?: { sequence_name: string; vote_type: string; created_at: string }[];
  santaLetters?: { child_name: string; child_age: number | string | null; status: string; created_at: string }[];
}

export async function exportAnalytics(format: 'csv' | 'json' | 'pdf', timeRange: '7d' | '30d') {
    try {
      if (format === 'pdf') {
        // Generate PDF client-side for better compatibility
        console.log('[PDF Export] Starting PDF generation...');
        
        const response = await fetch(`/api/analytics/export?format=pdf&range=${timeRange}`);
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        const reportData: PdfReportData = await response.json();
        
        if (!reportData || !reportData.summary) {
          throw new Error('Invalid data received from API');
        }
        
        console.log('[PDF Export] Data received:', reportData);
        
        // Create PDF using jsPDF
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        let yPos = 20;
        
        // Title
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('FPP Show Analytics Report', pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;
        
        // Metadata
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${reportData.generated}`, 14, yPos);
        yPos += 6;
        doc.text(`Range: ${reportData.range}`, 14, yPos);
        yPos += 10;
        
        // Summary Section
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary', 14, yPos);
        yPos += 8;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Page Views: ${reportData.summary.totalPageViews.toLocaleString()}`, 14, yPos);
        yPos += 6;
        doc.text(`Total Votes: ${reportData.summary.totalVotes.toLocaleString()}`, 14, yPos);
        yPos += 6;
        doc.text(`Total Santa Letters: ${reportData.summary.totalSantaLetters.toLocaleString()}`, 14, yPos);
        yPos += 12;
        
        // Page Views Table
        if (reportData.pageViews && reportData.pageViews.length > 0) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Recent Page Views', 14, yPos);
          yPos += 6;
          
          const pageViewRows = reportData.pageViews.slice(0, 30).map(view => [
            view.page_path,
            view.view_time,
          ]);
          
          autoTable(doc, {
            startY: yPos,
            head: [['Page', 'Date/Time']],
            body: pageViewRows,
            theme: 'striped',
            headStyles: { fillColor: [66, 139, 202] },
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9 },
          });
          
          yPos = (doc.lastAutoTable?.finalY ?? yPos) + 10;
        }
        
        // Check if we need a new page
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }
        
        // Votes Table
        if (reportData.votes && reportData.votes.length > 0) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Recent Votes', 14, yPos);
          yPos += 6;
          
          const voteRows = reportData.votes.slice(0, 30).map(vote => [
            vote.sequence_name,
            vote.vote_type === 'up' ? '👍 Up' : '👎 Down',
            vote.created_at,
          ]);
          
          autoTable(doc, {
            startY: yPos,
            head: [['Sequence', 'Vote', 'Date/Time']],
            body: voteRows,
            theme: 'striped',
            headStyles: { fillColor: [92, 184, 92] },
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9 },
          });
          
          yPos = (doc.lastAutoTable?.finalY ?? yPos) + 10;
        }
        
        // Check if we need a new page for Santa Letters
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }
        
        // Santa Letters Table
        if (reportData.santaLetters && reportData.santaLetters.length > 0) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Santa Letters', 14, yPos);
          yPos += 6;
          
          const letterRows = reportData.santaLetters.slice(0, 20).map(letter => [
            letter.child_name,
            letter.child_age || 'N/A',
            letter.status,
            letter.created_at.slice(0, 10),
          ]);
          
          autoTable(doc, {
            startY: yPos,
            head: [['Child Name', 'Age', 'Status', 'Date']],
            body: letterRows,
            theme: 'striped',
            headStyles: { fillColor: [217, 83, 79] },
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9 },
          });
        }
        
        // Save the PDF
        const filename = `analytics-${timeRange}-${localDateStamp()}.pdf`;
        doc.save(filename);
        
        console.log('[PDF Export] PDF saved successfully:', filename);
        return;
      }
      
      // For CSV and JSON, use the API endpoint
      const response = await fetch(`/api/analytics/export?format=${format}&range=${timeRange}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${timeRange}-${localDateStamp()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('[Export] Export failed:', error);
      console.error('[Export] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        format,
        timeRange
      });
      alert(`Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
