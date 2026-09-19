import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generates and downloads an official SmartWaste Monthly Summary PDF Report.
 * @param {Object} data Report data fetched from /api/reports/monthly-summary
 */
export function generateMonthlySummaryPDF(data) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // --- 1. Header Banner ---
  doc.setFillColor(13, 148, 136); // Teal-600
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SMARTWASTE MUNICIPAL OPERATIONS REPORT', 14, 15);

  // Subtitle & Metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Urban Solid Waste Telemetry, Fleet Logistics & Grievance Resolution Audit', 14, 22);

  const monthStr = data.month || 'Current Period';
  const genDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  doc.text(`Reporting Period: ${monthStr}  |  Generated On: ${genDate}`, 14, 28);

  // Depot Info right aligned
  doc.text(`Depot: ${data.depot?.name || 'Central Municipal Yard'}`, pageWidth - 14, 28, { align: 'right' });

  // --- 2. Executive KPI Highlights Grid ---
  let startY = 42;
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('1. EXECUTIVE SUMMARY & MUNICIPAL METRICS', 14, startY);

  const kpis = data.kpis || {};
  const kpiData = [
    [
      { content: 'Total Collections Completed', styles: { fontStyle: 'bold' } },
      `${kpis.collections_completed || 0} Bin Collections`,
      { content: 'Total Fuel Cost (INR)', styles: { fontStyle: 'bold' } },
      `Rs. ${(kpis.total_fuel_cost || 0).toLocaleString()}`
    ],
    [
      { content: 'Completed Dispatch Routes', styles: { fontStyle: 'bold' } },
      `${kpis.routes_completed || 0} Routes (${kpis.total_distance_km || 0} km)`,
      { content: 'Total Fuel Consumed', styles: { fontStyle: 'bold' } },
      `${kpis.total_fuel_liters || 0} Liters`
    ],
    [
      { content: 'Citizen Complaints Filed', styles: { fontStyle: 'bold' } },
      `${kpis.complaints_total || 0} Reports`,
      { content: 'Grievance Resolution Rate', styles: { fontStyle: 'bold' } },
      `${kpis.complaints_resolved || 0} Resolved (${kpis.resolution_rate_percent || 0}%)`
    ]
  ];

  autoTable(doc, {
    startY: startY + 4,
    body: kpiData,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249] },
    columnStyles: {
      0: { cellWidth: 50, fillColor: [248, 250, 252] },
      1: { cellWidth: 45, textColor: [13, 148, 136], fontStyle: 'bold' },
      2: { cellWidth: 45, fillColor: [248, 250, 252] },
      3: { cellWidth: 42, textColor: [15, 23, 42], fontStyle: 'bold' }
    }
  });

  // --- 3. Completed Routes & Collections Table ---
  startY = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('2. RECENT DISPATCH ROUTES & FIELD AUDIT', 14, startY);

  const routeRows = (data.completed_routes || []).map((r) => [
    `#${r.id} ${r.name}`,
    r.driver_name || 'Assigned Driver',
    r.vehicle_plate || 'KA-01-EA-1001',
    `${r.stop_count || 1} Stops`,
    `${r.total_distance_km} km`,
    r.completed_at ? new Date(r.completed_at).toLocaleDateString() : 'Completed'
  ]);

  autoTable(doc, {
    startY: startY + 4,
    head: [['Route Name', 'Driver', 'Vehicle', 'Stops', 'Distance', 'Date Completed']],
    body: routeRows.length > 0 ? routeRows : [['No completed routes recorded this period', '', '', '', '', '']],
    theme: 'striped',
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [240, 253, 250] }
  });

  // --- 4. Fleet Fuel Consumption & Performance Table ---
  startY = doc.lastAutoTable.finalY + 10;
  if (startY > pageHeight - 60) {
    doc.addPage();
    startY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('3. FLEET FUEL EXPENDITURE & MILEAGE', 14, startY);

  const vehicleRows = (data.vehicle_fuel_summary || []).map((v) => [
    v.plate_number,
    v.model,
    v.fuel_type || 'Diesel',
    `${Number(v.total_liters).toFixed(1)} L`,
    `Rs. ${Number(v.total_cost).toLocaleString()}`,
    `${v.avg_mileage_kmpl} km/L`
  ]);

  autoTable(doc, {
    startY: startY + 4,
    head: [['Plate Number', 'Vehicle Model', 'Fuel Type', 'Volume', 'Total Expense', 'Rated Mileage']],
    body: vehicleRows,
    theme: 'striped',
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.5 }
  });

  // --- 5. Citizen Grievances Breakdown ---
  startY = doc.lastAutoTable.finalY + 10;
  if (startY > pageHeight - 50) {
    doc.addPage();
    startY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('4. CITIZEN GRIEVANCE RESOLUTION AUDIT', 14, startY);

  const complaintRows = (data.complaints_by_category || []).map((c) => {
    const typeTitle = c.type?.replace('_', ' ').toUpperCase();
    const rate = c.total > 0 ? `${Math.round((c.resolved / c.total) * 100)}%` : '100%';
    return [typeTitle, c.total, c.resolved, rate];
  });

  autoTable(doc, {
    startY: startY + 4,
    head: [['Grievance Category', 'Total Reported', 'Resolved By Municipal Crew', 'Resolution %']],
    body: complaintRows,
    theme: 'striped',
    headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.5 }
  });

  // --- 6. Footer on all pages ---
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'SmartWaste Municipal Operations Command • Automated IoT Solid Waste Optimization System',
      14,
      pageHeight - 7
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }

  // Download PDF
  const filename = `SmartWaste_Monthly_Report_${monthStr}.pdf`;
  doc.save(filename);
}
