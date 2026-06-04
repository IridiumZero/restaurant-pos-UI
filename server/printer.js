const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const PRINTER_NAME = process.env.PRINTER_NAME || ''
const CHARS_PER_LINE = parseInt(process.env.RECEIPT_WIDTH) || 20
const PAPER_W_MM = parseInt(process.env.RECEIPT_WIDTH_MM) || 58
const PAPER_H_MM = parseInt(process.env.RECEIPT_HEIGHT_MM) || 80

// Receipt templates (zh / pt / en)
const LANGS = {
  zh: {
    header:      '=== 结 账 单 ===',
    orderNo:     '单号',
    table:       '桌号',
    waiter:      '服务员',
    time:        '时间',
    payment:     '支付方式',
    total:       '合计',
    received:    '收款',
    change:      '找零',
    thankYou:    '谢谢惠顾，欢迎再次光临！',
    totalItems:  '菜品总数',
    payments:    { '现金': '现金', 'POS机': 'POS机' },
  },
  pt: {
    header:      '=== RECIBO ===',
    orderNo:     'Pedido',
    table:       'Mesa',
    waiter:      'Garçom',
    time:        'Hora',
    payment:     'Pagamento',
    total:       'Total',
    received:    'Recebido',
    change:      'Troco',
    thankYou:    'Obrigado, volte sempre!',
    totalItems:  'Total de Itens',
    payments:    { '现金': 'Dinheiro', 'POS机': 'POS' },
  },
  en: {
    header:      '=== RECEIPT ===',
    orderNo:     'Order',
    table:       'Table',
    waiter:      'Waiter',
    time:        'Time',
    payment:     'Payment',
    total:       'Total',
    received:    'Received',
    change:      'Change',
    thankYou:    'Thank you, come again!',
    totalItems:  'Total Items',
    payments:    { '现金': 'Cash', 'POS机': 'POS' },
  },
}

// ── Text width helpers ────────────────────────────────

function charWidth(ch) {
  const code = ch.charCodeAt(0)
  if (code >= 0x4E00 && code <= 0x9FFF) return 2
  if (code >= 0x3000 && code <= 0x303F) return 2
  if (code >= 0xFF00 && code <= 0xFFEF) return 2
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

function formatLines(lines) {
  const result = []
  for (const line of lines) {
    if (visualLength(line) <= CHARS_PER_LINE) {
      result.push(line)
    } else {
      result.push(...wrapLine(line, CHARS_PER_LINE))
    }
  }
  return result
}

// ── Receipt generation ────────────────────────────────

function generateReceipt(order, lang) {
  const L = LANGS[lang] || LANGS.zh
  const W = CHARS_PER_LINE
  const pad = n => String(n).padStart(2, '0')
  const d = new Date()
  const time = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const paymentName = L.payments[order.payment_method] || order.payment_method || '-'

  const sep = '-'.repeat(W)

  const lines = [
    '',
    centerText(L.header, W),
    '',
    padLR(`${L.orderNo}:#${order.id}`, `${L.table}:${order.table_number}`, W),
    `${L.waiter}: ${order.waiter_name || '-'}`,
    `${L.time}: ${time}`,
    `${L.payment}: ${paymentName}`,
    sep,
  ]

  let totalQty = 0
  if (order.items && order.items.length) {
    for (const item of order.items) {
      const name = (lang === 'pt' && item.dish_name_pt) ? item.dish_name_pt
        : (lang === 'en' && item.dish_name_en) ? item.dish_name_en
        : item.dish_name || ''
      totalQty += item.quantity
      const price = (item.subtotal || item.dish_price * item.quantity).toFixed(2)
      const priceStr = `${price} MT`
      const nameLines = wrapLine('  ' + name, W)
      for (let i = 0; i < nameLines.length; i++) {
        lines.push(nameLines[i])
      }
      lines.push(padLR(`     x${item.quantity}`, priceStr, W))
    }
  }
  lines.push(sep)
  if (totalQty > 0) lines.push(padLR(`${L.totalItems}: ${totalQty}`, '', W))
  lines.push(padLR(`${L.total}:`, `${Number(order.total_amount).toFixed(2)} MT`, W))

  if (order.payment_method === '现金' && order.cash_received) {
    lines.push(padLR(`${L.received}:`, `${Number(order.cash_received).toFixed(2)} MT`, W))
    lines.push(padLR(`${L.change}:`, `${Number(order.change_amount || 0).toFixed(2)} MT`, W))
  }

  lines.push('')
  lines.push(centerText(L.thankYou, W))
  lines.push('')

  return formatLines(lines)
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

// ── Printing via .NET PrintDocument (custom paper size) ─

function printViaDotNet(text, printerName) {
  const paperW = Math.round(PAPER_W_MM * 3.937)   // mm → hundredths of inch

  // Calculate paper height from line count (roll paper, no fixed page length)
  const lineCount = text.split('\n').length
  const lineH_mm = 2.6   // 10px at 96 DPI ≈ 2.6mm per line (7pt font)
  const paperH_mm = Math.max(Number(PAPER_H_MM) || 80, Math.ceil(lineCount * lineH_mm) + 5)
  const paperH = Math.round(paperH_mm * 3.937)

  const psName = (printerName || '').replace(/'/g, "''")

  // Write text to a temp file to avoid PowerShell encoding issues with Chinese
  const txtPath = path.join(os.tmpdir(), `rcpt-${Date.now()}.txt`)
  fs.writeFileSync(txtPath, text, 'utf-8')

  // C# uses File.ReadAllText with UTF-8 to read the receipt text
  const psScript = [
    'Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"',
    'using System;',
    'using System.Drawing;',
    'using System.Drawing.Printing;',
    'using System.IO;',
    'using System.Text;',
    'public class RctPrinter {',
    '  private string _text;',
    '  private Font _font;',
    '  private float _y;',
    '  public RctPrinter(string filePath) { _text = File.ReadAllText(filePath, Encoding.UTF8); _font = new Font("Consolas", 7f); _y = 0; }',
    '  public void Print(string name, int w, int h) {',
    '    var d = new PrintDocument();',
    '    d.PrinterSettings.PrinterName = name;',
    '    d.DefaultPageSettings.PaperSize = new PaperSize("Rct", w, h);',
    '    d.DefaultPageSettings.Margins = new Margins(2, 2, 2, 2);',
    '    d.OriginAtMargins = true;',
    '    d.PrintPage += (s,e) => {',
    '      var brush = new SolidBrush(Color.Black);',
    '      foreach (var line in _text.Split(new[]{"\\r\\n","\\n"},StringSplitOptions.None)) {',
    '        e.Graphics.DrawString(line, _font, brush, 2, _y);',
    '        _y += 10f;',
    '      }',
    '      e.HasMorePages = false;',
    '    };',
    '    d.Print();',
    '  }',
    '}',
    '"@;',
    `$p = New-Object RctPrinter('${txtPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}');`,
    `$p.Print('${psName}', ${paperW}, ${paperH});`,
    `Write-Output 'OK'`,
  ].join('\n')

  const psPath = path.join(os.tmpdir(), `print-${Date.now()}.ps1`)
  // Write .ps1 with UTF-8 BOM for PowerShell 5.1 compatibility
  fs.writeFileSync(psPath, '﻿' + psScript, 'utf-8')

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

function printText(text) {
  const printerName = resolvePrinterName()
  if (!printerName) {
    console.error('[print] No printer found')
    return { success: false, error: 'No printer found' }
  }

  try {
    const result = printViaDotNet(text, printerName)
    if (!result.success) console.error('[print] Failed:', result.error)
    return result
  } catch (e) {
    console.error('[print] Error:', e.message)
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

module.exports = { generateReceipt, formatReceiptText, printText, listPrinters, PRINTER_NAME }
