const headings = ['Group', 'Cutting entries', 'Main pieces', 'Balance pieces', 'Total pieces'];

function reportRows(report) {
  return [...report.rows.map(row => [row.label, row.entries, row.main, row.balance, row.total]),
    ['Grand total', report.entries, report.main, report.balance, report.total]];
}

function saveBlob(blob, filename) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadExcel(report, title, context) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cutting production', { views:[{ state:'frozen', ySplit:4 }] });
  sheet.columns = [{ width:34 },{ width:20 },{ width:19 },{ width:19 },{ width:19 }];
  sheet.addRow([title]);
  sheet.addRow([context]);
  sheet.addRow([]);
  sheet.mergeCells('A1:E1');
  sheet.mergeCells('A2:E2');
  sheet.getRow(1).font = { size:16, bold:true, color:{ argb:'FF13243B' } };
  sheet.addRow(headings);
  sheet.getRow(4).eachCell(cell => {
    cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF13243B' } };
    cell.font = { bold:true, color:{ argb:'FFFFFFFF' } };
  });
  for (const row of reportRows(report)) sheet.addRow(row);
  for (let column = 2; column <= 5; column += 1) sheet.getColumn(column).numFmt = '#,##0';
  sheet.lastRow.font = { bold:true };
  if (report.rows.length) sheet.autoFilter = `A4:E${4 + report.rows.length}`;
  saveBlob(new Blob([await workbook.xlsx.writeBuffer()], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'cutting-production.xlsx');
}

function wrap(context, text, width) {
  const lines = [''];
  const segments = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined,{ granularity:'grapheme' }).segment(String(text)), part => part.segment)
    : Array.from(String(text));
  for (const segment of segments) {
    const current = lines.length - 1;
    if (segment === '\n' || context.measureText(lines[current] + segment).width > width) lines.push(segment === '\n' ? '' : segment);
    else lines[current] += segment;
  }
  return lines;
}

export async function downloadPdf(report, title, filters) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4', compress:true });
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1131;
  const context = canvas.getContext('2d');
  const columns = [60,550,810,1050,1290];
  let y;
  let page = 0;
  function paint(text, x, top, weight = 400, size = 25, color = '#13243b') {
    context.font = `${weight} ${size}px system-ui, sans-serif`;
    context.fillStyle = color;
    context.fillText(String(text), x, top);
  }
  function start() {
    page += 1;
    context.fillStyle = '#fff';
    context.fillRect(0,0,canvas.width,canvas.height);
    context.font = '700 44px system-ui, sans-serif';
    const titleLines = wrap(context,title,1480);
    titleLines.forEach((line,index) => paint(line,60,92 + index * 54,700,44));
    context.font = '400 25px system-ui, sans-serif';
    const filterLines = wrap(context,filters,1480);
    const filterTop = 140 + (titleLines.length - 1) * 54;
    filterLines.forEach((line,index) => paint(line,60,filterTop + index * 32));
    const header = filterTop + filterLines.length * 32 - 8;
    context.fillStyle = '#13243b';
    context.fillRect(52,header,1496,52);
    headings.forEach((heading,index) => paint(heading,columns[index],header + 35,700,25,'#fff'));
    y = header + 52;
  }
  function finish() {
    paint(`Page ${page}`,60,1084,400,22);
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,297,210,undefined,'FAST');
  }
  start();
  const rows = reportRows(report);
  rows.forEach((row,index) => {
    const total = index === rows.length - 1;
    context.font = `${total ? 700 : 400} 25px system-ui, sans-serif`;
    const lines = wrap(context,row[0],470);
    const height = Math.max(48,lines.length * 32 + 16);
    if (y + height > 1040) { finish(); pdf.addPage(); start(); }
    context.fillStyle = total ? '#d9edec' : index % 2 ? '#eef3f8' : '#fff';
    context.fillRect(52,y,1496,height);
    lines.forEach((line,lineIndex) => paint(line,columns[0],y + 32 + lineIndex * 32,total ? 700 : 400));
    row.slice(1).forEach((value,column) => paint(new Intl.NumberFormat('en-IN').format(value),columns[column + 1],y + 32,total ? 700 : 400));
    y += height;
  });
  finish();
  pdf.save('cutting-production.pdf');
}
