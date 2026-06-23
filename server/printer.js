const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PRINTER_NAME = process.env.PRINTER_NAME || ''
const KITCHEN_PRINTER_NAME = process.env.KITCHEN_PRINTER_NAME || ''

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

function generateReceipt(order, lang) {
  // Always bilingual (zh + pt), lang param kept for API compatibility
  const W = RECEIPT_CHARS
  const pad = n => String(n).padStart(2, '0')
  const d = new Date()
  const time = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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

      // Chinese name
      const nameZhLines = wrapLine('  ' + nameZh, W)
      for (const nl of nameZhLines) lines.push(nl)
      // Portuguese name
      if (namePt !== nameZh) {
        const namePtLines = wrapLine('  ' + namePt, W)
        for (const nl of namePtLines) lines.push(nl)
      }
      lines.push(padLR(`     x${item.quantity}`, priceStr, W))
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

function generateKitchenTicket(order, type, items, lang) {
  // Always bilingual (zh + pt), lang param kept for API compatibility
  const W = KITCHEN_CHARS
  const pad = n => String(n).padStart(2, '0')
  const d = new Date()
  const time = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

  const headerText = KITCHEN_BI[type] || KITCHEN_BI.new
  const sep = '-'.repeat(W)

  const lines = [
    '',
    centerText(headerText, W),
    '',
    `${KITCHEN_BI.orderNo}: #${order.id}`,
    `${KITCHEN_BI.table}: ${order.table_number}`,
    `${KITCHEN_BI.waiter}: ${order.waiter_name || '-'}`,
    `${KITCHEN_BI.time}: ${time}`,
    sep,
  ]

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

function resolvePrinterName() {
  if (PRINTER_NAME) return PRINTER_NAME
  try {
    const name = execSync(
      'powershell -NoProfile -Exec Bypass -Command "(Get-WmiObject -Query \\"Select * from Win32_Printer Where Default=True\\").Name"',
      { timeout: 5000, encoding: 'utf-8', windowsHide: true }
    ).trim()
    return name || ''
  } catch {
    return ''
  }
}

function resolveKitchenPrinterName() {
  // If KITCHEN_PRINTER_NAME is explicitly set, use it
  if (KITCHEN_PRINTER_NAME) return KITCHEN_PRINTER_NAME
  // If PRINTER_NAME is set, kitchen shares the same printer
  if (PRINTER_NAME) return PRINTER_NAME
  // Fall back to default printer
  return resolvePrinterName()
}

// ── Printing via .NET PrintDocument (custom paper size) ─

function printViaDotNet(text, printerName, paperWmm, paperHmm) {
  const paperW = Math.round(paperWmm * 3.937)   // mm → hundredths of inch

  // Calculate paper height from line count (roll paper, no fixed page length)
  const lineCount = text.split('\n').length
  const lineH_mm = 2.6   // 10px at 96 DPI ≈ 2.6mm per line (7pt font)
  const calcH_mm = Math.max(Number(paperHmm) || 80, Math.ceil(lineCount * lineH_mm) + 5)
  const paperH = Math.round(calcH_mm * 3.937)

  const psName = (printerName || '').replace(/'/g, "''")

  // Write text to a temp file to avoid PowerShell encoding issues with Chinese
  const txtPath = path.join(os.tmpdir(), `rcpt-${Date.now()}.txt`)
  fs.writeFileSync(txtPath, text, 'utf-8')

  // C# uses File.ReadAllText with UTF-8 to read the receipt text
  // Font fallback: Consolas for Latin, Microsoft YaHei for CJK characters
  const psScript = [
    'Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"',
    'using System;',
    'using System.Drawing;',
    'using System.Drawing.Printing;',
    'using System.IO;',
    'using System.Text;',
    'public class RctPrinter {',
    '  private string _text;',
    '  private Font _latinFont;',
    '  private Font _cjkFont;',
    '  private float _y;',
    '  public RctPrinter(string filePath) {',
    '    _text = File.ReadAllText(filePath, Encoding.UTF8);',
    '    _latinFont = new Font("Consolas", 7f);',
    '    _cjkFont = new Font("Microsoft YaHei", 7f);',
    '    _y = 0;',
    '  }',
    '  public void Print(string name, int w, int h) {',
    '    var d = new PrintDocument();',
    '    d.PrinterSettings.PrinterName = name;',
    '    d.DefaultPageSettings.PaperSize = new PaperSize("Rct", w, h);',
    '    d.DefaultPageSettings.Margins = new Margins(2, 2, 2, 2);',
    '    d.OriginAtMargins = true;',
    '    d.PrintPage += (s,e) => {',
    '      var brush = new SolidBrush(Color.Black);',
    '      var lines = _text.Split(new[]{"\\r\\n","\\n"}, StringSplitOptions.None);',
    '      foreach (var line in lines) {',
    '        DrawLine(e.Graphics, line, brush, 2, _y);',
    '        _y += 10f;',
    '      }',
    '      e.HasMorePages = false;',
    '    };',
    '    d.Print();',
    '  }',
    '  private void DrawLine(Graphics g, string line, Brush brush, float x, float y) {',
    '    foreach (char c in line) {',
    '      Font f = IsCjk(c) ? _cjkFont : _latinFont;',
    '      g.DrawString(c.ToString(), f, brush, x, y);',
    '      x += g.MeasureString(c.ToString(), f).Width;',
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
    `$p = New-Object RctPrinter('${txtPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}');`,
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

function printText(text, printerOverride) {
  const printerName = printerOverride || resolvePrinterName()
  if (!printerName) {
    console.error('[print] No printer found')
    return { success: false, error: 'No printer found' }
  }

  try {
    const result = printViaDotNet(text, printerName, RECEIPT_W_MM, RECEIPT_H_MM)
    if (!result.success) console.error('[print] Failed:', result.error)
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
    const result = printViaDotNet(text, printerName, KITCHEN_W_MM, KITCHEN_H_MM)
    if (!result.success) console.error('[kitchen-print] Failed:', result.error)
    else console.log('[kitchen-print] OK →', printerName)
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

module.exports = {
  generateReceipt,
  generateKitchenTicket,
  formatReceiptText,
  printText,
  printKitchen,
  listPrinters,
  PRINTER_NAME,
  KITCHEN_PRINTER_NAME,
}
