const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PRINTER_NAME = process.env.PRINTER_NAME || ''
const KITCHEN_PRINTER_NAME = process.env.KITCHEN_PRINTER_NAME || ''

// Horizontal position tuning (negative = shift left, positive = shift right)
// ~10% of 80mm paper ≈ 30 hundredths-of-inch. Adjust via env if needed.
const RECEIPT_H_OFFSET = parseInt(process.env.RECEIPT_H_OFFSET) || -30
const RECEIPT_BODY_OFFSET = parseInt(process.env.RECEIPT_BODY_OFFSET) || 0

// Receipt printer: 80mm paper
const RECEIPT_CHARS = parseInt(process.env.RECEIPT_WIDTH) || 32
const RECEIPT_W_MM  = parseInt(process.env.RECEIPT_WIDTH_MM) || 80
const RECEIPT_H_MM  = parseInt(process.env.RECEIPT_HEIGHT_MM) || 80

// Kitchen printer: 80mm paper (same as receipt)
const KITCHEN_CHARS = parseInt(process.env.KITCHEN_WIDTH) || 32
const KITCHEN_W_MM  = parseInt(process.env.KITCHEN_WIDTH_MM) || 80
const KITCHEN_H_MM  = parseInt(process.env.KITCHEN_HEIGHT_MM) || 80

// ── Bilingual template (zh + pt, always) ──────────────
const BI = {
  header:      '== 结账单/RECIBO ==',
  orderNo:     '单号/Pedido',
  table:       '桌号/Mesa',
  waiter:      '服务员/Garçom',
  time:        '时间/Hora',
  payment:     '付款/Pagamento',
  total:       '合计/Total',
  received:    '收款/Recebido',
  change:      '找零/Troco',
  thankYou:    '谢谢惠顾! Obrigado!',
  totalItems:  '总数/Itens',
  payments:    { '现金': 'Dinheiro', 'POS机': 'POS', 'cash': 'Dinheiro', 'pos': 'POS' },
}

function isPaymentCash(method) {
  return method === '现金' || method === 'cash'
}

// ── Kitchen bilingual template (zh + pt, always) ──────
const KITCHEN_BI = {
  new:      '====== 厨打/COZINHA ======',
  addon:    '===== 加菜/ADICIONAL =====',
  cancel:   '==== 退菜/CANCELADO =====',
  reprint:  '===== 补打/REIMPRIMIR =====',
  orderNo:  '单号/Pedido',
  table:    '桌号/Mesa',
  waiter:   '服务员/Garçom',
  time:     '时间/Hora',
  qty:      '数量/Qtd',
  remark:   '备注/Obs',
  cancelReason: '原因/Motivo',
}

// ── Text width helpers ────────────────────────────────

function charWidth(ch) {
  const code = ch.charCodeAt(0)
  if (code >= 0x4E00 && code <= 0x9FFF) return 2  // CJK Unified Ideographs
  if (code >= 0x3400 && code <= 0x4DBF) return 2  // CJK Extension A
  if (code >= 0x3000 && code <= 0x303F) return 2  // CJK Symbols/Punctuation
  if (code >= 0xFF00 && code <= 0xFFEF) return 2  // Fullwidth Forms
  if (code >= 0x2E80 && code <= 0x2FDF) return 2  // CJK Radicals
  if (code >= 0xF900 && code <= 0xFAFF) return 2  // CJK Compatibility Ideographs
  return 1
}

function visualLength(str) {
  let len = 0
  for (const ch of str) len += charWidth(ch)
  return len
}

function wrapLine(line, maxWidth) {
  if (visualLength(line) <= maxWidth) return [line]
  const result = []
  let current = ''
  let currentLen = 0
  for (const ch of line) {
    const w = charWidth(ch)
    if (currentLen + w > maxWidth) {
      result.push(current)
      current = ch
      currentLen = w
    } else {
      current += ch
      currentLen += w
    }
  }
  if (current) result.push(current)
  return result
}

// ── Layout helpers ─────────────────────────────────────

function padLR(left, right, width) {
  const gap = width - visualLength(left) - visualLength(right)
  if (gap <= 0) return left + ' ' + right
  return left + ' '.repeat(gap) + right
}

function centerText(text, width) {
  const pad = Math.max(0, Math.floor((width - visualLength(text)) / 2))
  return ' '.repeat(pad) + text
}

function formatLines(lines, maxWidth) {
  const result = []
  for (const line of lines) {
    if (visualLength(line) <= maxWidth) {
      result.push(line)
    } else {
      result.push(...wrapLine(line, maxWidth))
    }
  }
  return result
}

// ── Receipt generation ────────────────────────────────

function generateReceipt(order) {
  const W = RECEIPT_CHARS
  const pad = n => String(n).padStart(2, '0')
  const d = new Date()
  const time = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const paymentZh = isPaymentCash(order.payment_method) ? '现金' : (order.payment_method === 'pos' ? 'POS机' : (order.payment_method || '-'))
  const paymentPt = BI.payments[order.payment_method] || BI.payments[paymentZh] || paymentZh

  const sep = '-'.repeat(W)

  const lines = [
    '',
    centerText(BI.header, W),
    '',
    `${BI.orderNo}: #${order.id}`,
    `${BI.table}: ${order.table_number}`,
    `${BI.waiter}: ${order.waiter_name || '-'}`,
    `${BI.time}: ${time}`,
    `${BI.payment}: ${paymentZh} / ${paymentPt}`,
    sep,
  ]

  let totalQty = 0
  if (order.items && order.items.length) {
    for (const item of order.items) {
      // Skip cancelled items
      if (item.item_status === 'cancelled') continue
      const nameZh = item.dish_name || ''
      const namePt = item.dish_name_pt || nameZh
      totalQty += item.quantity
      const price = (item.subtotal || item.dish_price * item.quantity).toFixed(2)
      const priceStr = `${price} MT`
      const qtyStr = ` x${item.quantity}`

      // Chinese name + quantity on same line, price right-aligned
      const nameQty = nameZh + qtyStr
      if (visualLength(nameQty) + visualLength(priceStr) + 1 <= W) {
        lines.push(padLR(nameQty, priceStr, W))
      } else {
        // Name too long — name on its own line, qty+price on next
        lines.push(nameZh)
        lines.push(padLR(' x' + item.quantity, priceStr, W))
      }
      // Portuguese name below (slight indent)
      if (namePt !== nameZh) {
        const namePtLines = wrapLine(' ' + namePt, W)
        for (const nl of namePtLines) lines.push(nl)
      }
    }
  }
  lines.push(sep)
  if (totalQty > 0) lines.push(padLR(`${BI.totalItems}: ${totalQty}`, '', W))
  lines.push(padLR(`${BI.total}:`, `${Number(order.total_amount).toFixed(2)} MT`, W))

  if (isPaymentCash(order.payment_method) && order.cash_received) {
    lines.push(padLR(`${BI.received}:`, `${Number(order.cash_received).toFixed(2)} MT`, W))
    lines.push(padLR(`${BI.change}:`, `${Number(order.change_amount || 0).toFixed(2)} MT`, W))
  }

  lines.push('')
  lines.push(centerText(BI.thankYou, W))
  lines.push('')

  return formatLines(lines, W)
}

// ── Kitchen ticket generation ─────────────────────────

function generateKitchenTicket(order, type, items, skipHeader) {
  const W = KITCHEN_CHARS
  const pad = n => String(n).padStart(2, '0')
  const d = new Date()
  const time = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

  const headerText = KITCHEN_BI[type] || KITCHEN_BI.new
  const sep = '-'.repeat(W)

  const lines = [
    '',
    centerText(headerText, W),
    '',
  ]

  if (!skipHeader) {
    lines.push(
      `${KITCHEN_BI.orderNo}: #${order.id}`,
      `${KITCHEN_BI.table}: ${order.table_number}`,
      `${KITCHEN_BI.waiter}: ${order.waiter_name || '-'}`,
      `${KITCHEN_BI.time}: ${time}`,
    )
  }
  lines.push(sep)

  if (items && items.length) {
    for (const item of items) {
      const nameZh = item.dish_name || ''
      const namePt = item.dish_name_pt || nameZh

      // Chinese name
      const nameZhLines = wrapLine(nameZh, W)
      for (const nl of nameZhLines) lines.push(nl)
      // Portuguese name
      if (namePt !== nameZh) {
        const namePtLines = wrapLine(namePt, W)
        for (const nl of namePtLines) lines.push(nl)
      }

      // Quantity line
      const qty = item.print_qty != null ? item.print_qty : item.quantity
      lines.push(padLR(`  ${KITCHEN_BI.qty}: x${qty}`, '', W))

      // Flavor choices (bilingual: zh + pt)
      let flavors = item.flavors
      if (typeof flavors === 'string' && flavors) {
        try { flavors = JSON.parse(flavors) } catch { flavors = null }
      }
      if (Array.isArray(flavors) && flavors.length) {
        for (const f of flavors) {
          // Flavor name: zh/pt bilingual
          const fNameZh = f.name || ''
          const fNamePt = f.name_pt || ''
          const fName = fNamePt && fNamePt !== fNameZh ? `${fNameZh}/${fNamePt}` : fNameZh

          // Flavor value: stored as "zh/pt/en" trilingual, extract zh + pt
          let fValueZh = f.value || ''
          let fValuePt = ''
          if (f.value && f.value.includes('/')) {
            const parts = f.value.split('/')
            fValueZh = parts[0] || ''
            fValuePt = parts[1] || ''
          }
          const fValue = fValuePt && fValuePt !== fValueZh ? `${fValueZh}/${fValuePt}` : fValueZh

          const flavorLine = `  * ${fName}: ${fValue}`
          const flavorLines = wrapLine(flavorLine, W)
          for (const fl of flavorLines) lines.push(fl)
        }
      }

      // Cancel reason (if cancel type)
      if (type === 'cancel' && item.cancel_reason) {
        const reasonLines = wrapLine(`  ${KITCHEN_BI.cancelReason}: ${item.cancel_reason}`, W)
        for (const rl of reasonLines) lines.push(rl)
      }

      lines.push('')
    }
  }

  lines.push(sep)
  lines.push('')

  return formatLines(lines, W)
}

function formatReceiptText(lines) {
  return lines.join('\r\n')
}

// ── Printer discovery ──────────────────────────────────

// List all installed printer names (cached for the process lifetime)
let _printerList = null
function getInstalledPrinters() {
  if (_printerList) return _printerList
  try {
    const output = execSync(
      'powershell -NoProfile -Exec Bypass -Command "Get-Printer | Select-Object -ExpandProperty Name"',
      { timeout: 8000, encoding: 'utf-8', windowsHide: true }
    )
    _printerList = output.split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    _printerList = []
  }
  return _printerList
}

// Search installed printers by keyword (case-insensitive)
function findPrinterByKeyword(keyword) {
  const list = getInstalledPrinters()
  return list.find(p => p.toLowerCase().includes(keyword.toLowerCase())) || ''
}

function resolvePrinterName() {
  // 1. Env var (takes priority — set in start-server.bat)
  if (PRINTER_NAME) return PRINTER_NAME
  // 2. Auto-detect: look for "xiaopiao" (小票) in printer names
  const found = findPrinterByKeyword('xiaopiao')
  if (found) return found
  // 3. Fall back to system default
  return findPrinterByKeyword('') || ''
}

function resolveKitchenPrinterName() {
  // 1. Env var (takes priority — set in start-server.bat)
  if (KITCHEN_PRINTER_NAME) return KITCHEN_PRINTER_NAME
  // 2. Auto-detect: look for "chufang" (厨房) in printer names
  const found = findPrinterByKeyword('chufang')
  if (found) return found
  // 3. If PRINTER_NAME is set, share the receipt printer
  if (PRINTER_NAME) return PRINTER_NAME
  // 4. Fall back to auto-detected receipt or default printer
  return resolvePrinterName()
}

// ── Get printer IP from Windows printer port ────────────

function getPrinterIP(printerName) {
  try {
    const psName = (printerName || resolvePrinterName()).replace(/'/g, "''")
    const portName = execSync(
      `powershell -NoProfile -Exec Bypass -Command "(Get-Printer -Name '${psName}').PortName"`,
      { timeout: 5000, encoding: 'utf-8', windowsHide: true }
    ).trim()
    // XP-80C network printers use port names like "IP_192.168.5.25"
    const match = portName.match(/(\d+\.\d+\.\d+\.\d+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// ── Cash drawer control ─────────────────────────────────
// ESC/POS command: ESC p m t1 t2
// m=0: drawer kick connector pin 2
// t1=25: pulse ON  = 25 × 2ms = 50ms
// t2=250: pulse OFF = 250 × 2ms = 500ms
// Sent via raw TCP to printer port 9100 (bypasses print driver)

function openCashDrawer(printerName) {
  const name = printerName || resolvePrinterName()
  if (!name) {
    console.error('[cash-drawer] No printer found')
    return { success: false, error: 'No printer found' }
  }

  const ip = getPrinterIP(name)
  if (!ip) {
    console.error('[cash-drawer] Could not resolve printer IP for:', name)
    return { success: false, error: `Could not resolve printer IP for: ${name}` }
  }

  // Write PowerShell script to temp file for reliable execution
  const psScript = [
    `$c = New-Object System.Net.Sockets.TcpClient('${ip}', 9100)`,
    `$s = $c.GetStream()`,
    `$bytes = [byte[]]@(0x1B, 0x70, 0x00, 0x19, 0xFA)`,
    `$s.Write($bytes, 0, $bytes.Length)`,
    `$s.Close()`,
    `$c.Close()`,
    `Write-Output 'OK'`,
  ].join('\n')

  const psPath = path.join(os.tmpdir(), `drawer-${Date.now()}.ps1`)
  fs.writeFileSync(psPath, '﻿' + psScript, 'utf-8')

  try {
    const result = execSync(
      `powershell -NoProfile -Exec Bypass -File "${psPath}"`,
      { timeout: 5000, encoding: 'utf-8', windowsHide: true }
    )
    try { fs.unlinkSync(psPath) } catch {}
    if (result.trim() === 'OK') {
      console.log('[cash-drawer] OK →', name, `(${ip}:9100)`)
      return { success: true, method: 'escpos-tcp', printer: name, ip }
    }
    return { success: false, error: result.trim() || 'No output' }
  } catch (e) {
    try { fs.unlinkSync(psPath) } catch {}
    console.error('[cash-drawer] Error:', e.message)
    return { success: false, error: e.message }
  }
}

// ── Printing via .NET PrintDocument (custom paper size) ─

function printViaDotNet(text, printerName, paperWmm, paperHmm, fontSize, opts) {
  const fz = fontSize || 12
  const lineH = Math.round(fz * 1.6)    // line height with CJK headroom (prev 1.35)
  const paperW = Math.round(paperWmm * 3.937)   // mm → hundredths of inch

  // Optional logo + title header
  const logoPath = (opts && opts.logoPath) || ''
  const title = (opts && opts.title) || ''

  // Calculate paper height from line count (roll paper, no fixed page length)
  const lineCount = text.split('\n').length
  const lineH_mm = Math.round(lineH / 96 * 25.4 * 10) / 10   // px → mm at 96 DPI
  const logoExtra = logoPath ? 60 : (title ? 10 : 0)  // extra mm for logo/title area
  const calcH_mm = Math.max(Number(paperHmm) || 80, Math.ceil(lineCount * lineH_mm) + 5 + logoExtra)
  const paperH = Math.round(calcH_mm * 3.937)

  const psName = (printerName || '').replace(/'/g, "''")

  // Write text to a temp file to avoid PowerShell encoding issues with Chinese
  const txtPath = path.join(os.tmpdir(), `rcpt-${Date.now()}.txt`)
  fs.writeFileSync(txtPath, text, 'utf-8')

  // C# uses File.ReadAllText with UTF-8 to read the receipt text
  // Font: Consolas (Latin) + Microsoft YaHei (CJK), Tight rendering via GenericTypographic
  const titleFontSize = fz + 3
  const titleLineH = Math.round(titleFontSize * 1.5)

  const psScript = [
    'Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"',
    'using System;',
    'using System.Drawing;',
    'using System.Drawing.Printing;',
    'using System.IO;',
    'using System.Text;',
    'public class RctPrinter {',
    '  private string _text;',
    '  private string _logoPath;',
    '  private string _title;',
    '  private Font _latinFont;',
    '  private Font _cjkFont;',
    '  private float _lineH;',
    '  private float _y;',
    '  private StringFormat _sf;',
    '  public RctPrinter(string filePath, string logoPath, string title) {',
    '    _text = File.ReadAllText(filePath, Encoding.UTF8);',
    '    _logoPath = logoPath;',
    '    _title = title;',
    `    _latinFont = new Font("Consolas", ${fz}f, FontStyle.Regular, GraphicsUnit.Point);`,
    `    _cjkFont = new Font("Microsoft YaHei", ${fz}f, FontStyle.Regular, GraphicsUnit.Point);`,
    `    _lineH = ${lineH}f;`,
    '    _y = 8f;',
    '    _sf = StringFormat.GenericTypographic;',
    '    _sf.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces;',
    '  }',
    '  public void Print(string name, int w, int h) {',
    '    var d = new PrintDocument();',
    '    d.PrinterSettings.PrinterName = name;',
    '    d.DefaultPageSettings.PaperSize = new PaperSize("Rct", w, h);',
    '    d.DefaultPageSettings.Margins = new Margins(2, 2, 2, 2);',
    '    d.OriginAtMargins = false;',
    '    d.PrintPage += (s,e) => {',
    '      e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;',
    '      // Use physical page coordinates for reliable centering',
    '      float pageW = e.PageBounds.Width;',
    `      float hOff = ${RECEIPT_H_OFFSET}f;  // horizontal tuning offset (logo+title only)`,
    `      float bodyOff = ${RECEIPT_BODY_OFFSET}f;`,
    '      float bodyX = e.MarginBounds.Left + bodyOff;',
    '      // ── Logo image (centered on physical page, ~38% of page width) ──',
    '      if (!string.IsNullOrEmpty(_logoPath) && File.Exists(_logoPath)) {',
    '        try {',
    '          Image logo = Image.FromFile(_logoPath);',
    '          float maxW = pageW * 0.38f;',
    '          float lw = (float)logo.Width, lh = (float)logo.Height;',
    '          if (lw > maxW) { lh *= maxW / lw; lw = maxW; }',
    '          float lx = (pageW - lw) / 2f + hOff;',
    '          _y += 10f;',
    '          e.Graphics.DrawImage(logo, lx, _y, lw, lh);',
    '          _y += lh + 12f;',
    '          logo.Dispose();',
    '        } catch { _y += 10f; }',
    '      }',
    '      // ── Title text (centered on physical page, split by |) ──',
    '      if (!string.IsNullOrEmpty(_title)) {',
    `        var titleFont = new Font("Microsoft YaHei", ${titleFontSize}f, FontStyle.Bold, GraphicsUnit.Point);`,
    '        var titleLines = _title.Split(new[]{"|"}, StringSplitOptions.None);',
    '        var titleBrush = new SolidBrush(Color.Black);',
    '        var centerSf = new StringFormat();',
    '        centerSf.Alignment = StringAlignment.Center;',
    '        centerSf.LineAlignment = StringAlignment.Near;',
    '        foreach (var tl in titleLines) {',
    `          RectangleF rect = new RectangleF(hOff, _y, pageW, ${titleLineH + 10}f);`,
    '          e.Graphics.DrawString(tl, titleFont, titleBrush, rect, centerSf);',
    `          _y += ${titleLineH}f + 4f;`,
    '        }',
    '        titleFont.Dispose();',
    '        centerSf.Dispose();',
    '        titleBrush.Dispose();',
    '      }',
    '      _y += 12f;',
    '      // ── Body text ──',
    '      var brush = new SolidBrush(Color.Black);',
    '      var lines = _text.Split(new[]{"\\r\\n","\\n"}, StringSplitOptions.None);',
    '      foreach (var line in lines) {',
    '        DrawLine(e.Graphics, line, brush, bodyX, _y);',
    '        _y += _lineH;',
    '      }',
    '      e.HasMorePages = false;',
    '    };',
    '    d.Print();',
    '  }',
    '  private void DrawLine(Graphics g, string line, Brush brush, float x, float y) {',
    '    // Render in same-font segments to avoid cumulative MeasureString drift (fixes CJK garbled text)',
    '    if (string.IsNullOrEmpty(line)) return;',
    '    int i = 0;',
    '    while (i < line.Length) {',
    '      bool isCjk = IsCjk(line[i]);',
    '      int j = i + 1;',
    '      while (j < line.Length && IsCjk(line[j]) == isCjk) j++;',
    '      string seg = line.Substring(i, j - i);',
    '      Font f = isCjk ? _cjkFont : _latinFont;',
    '      g.DrawString(seg, f, brush, x, y, _sf);',
    '      float sw = g.MeasureString(seg, f, int.MaxValue, _sf).Width;',
    '      x += sw;',
    '      i = j;',
    '    }',
    '  }',
    '  private bool IsCjk(char c) {',
    '    int cp = (int)c;',
    '    return (cp >= 0x4E00 && cp <= 0x9FFF) ||',
    '           (cp >= 0x3000 && cp <= 0x303F) ||',
    '           (cp >= 0xFF00 && cp <= 0xFFEF) ||',
    '           (cp >= 0x3400 && cp <= 0x4DBF) ||',
    '           (cp >= 0x2E80 && cp <= 0x2FDF) ||',
    '           (cp >= 0xF900 && cp <= 0xFAFF);',
    '  }',
    '}',
    '"@;',
    `$p = New-Object RctPrinter('${txtPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}', '${logoPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}', '${title.replace(/\\/g, '\\\\').replace(/'/g, "''")}');`,
    `$p.Print('${psName}', ${paperW}, ${paperH});`,
    `Write-Output 'OK'`,
  ].join('\n')

  const psPath = path.join(os.tmpdir(), `print-${Date.now()}.ps1`)
  // Write .ps1 with UTF-8 BOM for PowerShell 5.1 compatibility
  fs.writeFileSync(psPath, '\uFEFF' + psScript, 'utf-8')

  try {
    const result = execSync(
      `powershell -NoProfile -Exec Bypass -File "${psPath}"`,
      { timeout: 20000, encoding: 'utf-8', windowsHide: true }
    )
    try { fs.unlinkSync(psPath); fs.unlinkSync(txtPath) } catch {}
    if (result.trim() === 'OK') return { success: true, method: 'dotnet', printer: printerName }
    return { success: false, error: result.trim() || 'No output' }
  } catch (e) {
    try { fs.unlinkSync(psPath); fs.unlinkSync(txtPath) } catch {}
    throw e
  }
}

function printText(text, printerOverride, opts) {
  const printerName = printerOverride || resolvePrinterName()
  if (!printerName) {
    console.error('[print] No printer found')
    return { success: false, error: 'No printer found' }
  }

  try {
    const result = printViaDotNet(text, printerName, RECEIPT_W_MM, RECEIPT_H_MM, 10, opts)
    if (!result.success) console.error('[print] Failed:', result.error)
    else console.log('[print] 小票 →', printerName)
    return result
  } catch (e) {
    console.error('[print] Error:', e.message)
    return { success: false, error: e.message }
  }
}

function printKitchen(text) {
  const printerName = resolveKitchenPrinterName()
  if (!printerName) {
    console.error('[kitchen-print] No kitchen printer found')
    return { success: false, error: 'No kitchen printer found' }
  }

  try {
    const result = printViaDotNet(text, printerName, KITCHEN_W_MM, KITCHEN_H_MM, 10)
    if (!result.success) console.error('[kitchen-print] Failed:', result.error)
    else console.log('[kitchen-print] 厨打 →', printerName)
    return result
  } catch (e) {
    console.error('[kitchen-print] Error:', e.message)
    return { success: false, error: e.message }
  }
}

function listPrinters() {
  try {
    const output = execSync(
      'powershell -NoProfile -Exec Bypass -Command "Get-Printer | Select-Object Name, PortName, PrinterStatus, Shared | Format-Table -AutoSize | Out-String -Width 200"',
      { timeout: 8000, encoding: 'utf-8', windowsHide: true }
    )
    return output.trim()
  } catch (e) {
    return `Failed: ${e.message}`
  }
}

// ── Detailed printer info (for diagnostics) ─────────────

function getPrinterDetails() {
  const printers = getInstalledPrinters()
  const receipt = resolvePrinterName()
  const kitchen = resolveKitchenPrinterName()
  const details = []

  for (const name of printers) {
    let portName = ''
    let ip = null
    let isOnline = false
    try {
      const psName = name.replace(/'/g, "''")
      portName = execSync(
        `powershell -NoProfile -Exec Bypass -Command "(Get-Printer -Name '${psName}').PortName"`,
        { timeout: 5000, encoding: 'utf-8', windowsHide: true }
      ).trim()
      const match = portName.match(/(\d+\.\d+\.\d+\.\d+)/)
      ip = match ? match[1] : null
      // Check printer status
      const status = execSync(
        `powershell -NoProfile -Exec Bypass -Command "(Get-Printer -Name '${psName}').PrinterStatus"`,
        { timeout: 5000, encoding: 'utf-8', windowsHide: true }
      ).trim()
      isOnline = status === '0' || status === 'Normal' || status === '3'  // 0=Ready, 3=Idle
    } catch { /* ignore errors for individual printers */ }
    details.push({
      name,
      port: portName || 'unknown',
      ip: ip || null,
      online: isOnline,
      role: name === receipt ? 'receipt' : name === kitchen ? 'kitchen' : null,
    })
  }
  return {
    printers: details,
    receipt: receipt || null,
    kitchen: kitchen || null,
  }
}

// ── Startup: log configured printers ──────────────────
;(() => {
  const info = getPrinterDetails()
  console.log('[printer] 系统打印机:', info.printers.map(p => p.name).join(', '))
  for (const p of info.printers) {
    const roleTag = p.role ? ` [${p.role === 'receipt' ? '小票' : '厨打'}]` : ''
    const ipTag = p.ip ? ` → ${p.ip}:9100` : ''
    const statusTag = p.online ? '✓' : '✗ (离线)'
    console.log(`[printer]   ${statusTag} ${p.name}${roleTag} 端口=${p.port}${ipTag}`)
  }
  if (!info.receipt) console.log('[printer] ⚠️  未找到小票打印机！通过 PRINTER_NAME 环境变量指定')
  if (!info.kitchen) console.log('[printer] ⚠️  未找到厨房打印机！通过 KITCHEN_PRINTER_NAME 环境变量指定')
  // If any network printer is offline, warn about possible IP change
  const offlineNetPrinters = info.printers.filter(p => p.ip && !p.online)
  if (offlineNetPrinters.length) {
    console.log('[printer] ⚠️  以下网络打印机离线，IP 可能已变更：')
    for (const p of offlineNetPrinters) {
      console.log(`[printer]     ${p.name} — 当前端口 IP: ${p.ip}`)
    }
  }
})()

module.exports = {
  // Public API
  generateReceipt,
  generateKitchenTicket,
  formatReceiptText,
  printText,
  printKitchen,
  listPrinters,
  getPrinterDetails,
  openCashDrawer,
  getPrinterIP,
  PRINTER_NAME,
  KITCHEN_PRINTER_NAME,
  // Exported for testing
  charWidth,
  visualLength,
  wrapLine,
  centerText,
  padLR,
}
