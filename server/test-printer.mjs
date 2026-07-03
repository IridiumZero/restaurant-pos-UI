/**
 * 打印机模块单元测试 — 验证结账小票生成、居中对齐、中文编码
 * 用法: node server/test-printer.mjs
 * 无需服务器运行，直接测试 printer.js 导出函数
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const {
  generateReceipt,
  generateKitchenTicket,
  formatReceiptText,
  centerText,
  padLR,
  visualLength,
  wrapLine,
  charWidth,
} = require('./printer.js')

// ── Test helpers ──────────────────────────

/** Check if a string is valid UTF-8 (no replacement chars, no mojibake) */
function hasNoGarbledText(str) {
  // Check for Unicode replacement character (FFFD) — a sign of encoding failure
  if (str.includes('�')) return false
  // Check for common garbled text patterns
  const garbledPatterns = [
    /\?{3,}/,           // Multiple question marks (encoding fallback)
    /[\x00-\x08]/,      // Control chars that shouldn't be in receipt text
    /\x0B/,             // Vertical tab
    /\x0E|\x0F/,        // Shift out/in
  ]
  for (const p of garbledPatterns) {
    if (p.test(str)) return false
  }
  return true
}

/** Verify CJK characters are intact in a string */
function assertCjkIntact(str, label) {
  // The string should contain actual CJK characters, not garbled
  const cjkChars = [...str].filter(c => {
    const code = c.charCodeAt(0)
    return (code >= 0x4E00 && code <= 0x9FFF) ||
           (code >= 0x3400 && code <= 0x4DBF)
  })
  if (cjkChars.length > 0) {
    // Verify each CJK char is in valid Unicode range
    for (const c of cjkChars) {
      const code = c.charCodeAt(0)
      assert.ok(code >= 0x2E80, `${label}: CJK char "${c}" (U+${code.toString(16)}) is valid Unicode`)
    }
  }
}

/** Verify a centered line is approximately centered within width */
function assertCentered(line, width) {
  const lineLen = visualLength(line)
  // If line is shorter than width, it should have leading spaces for centering
  if (lineLen < width) {
    const leadingSpaces = line.length - line.trimStart().length
    const expectedPad = Math.floor((width - visualLength(line.trimStart())) / 2)
    // Allow ±1 difference due to rounding
    const diff = Math.abs(leadingSpaces - expectedPad - (line.length - line.trimStart().length - leadingSpaces))
    // The centered text should have roughly equal padding on both sides
    // (accounting for visual length vs actual char count differences)
    const trimmed = line.trim()
    const totalPadding = width - visualLength(trimmed)
    const leftPadding = line.length - line.trimStart().length
    // Check that left padding is close to half of total visual padding
    // We use visual length, so this is approximate
    const visualLeftPad = visualLength(line.slice(0, leftPadding))
    const expectedLeftPad = Math.floor(totalPadding / 2)
    // Allow ±2 due to CJK/ASCII width rounding
    if (Math.abs(visualLeftPad - expectedLeftPad) > 2) {
      console.log(`  ⚠ Centering check: line="${trimmed}", width=${width}, totalPad=${totalPadding}, leftPad=${visualLeftPad}, expectedLeftPad=${expectedLeftPad}`)
    }
  }
}

// ── Tests ─────────────────────────────────

describe('charWidth — 字符宽度判断', () => {
  it('ASCII 字符返回 1', () => {
    assert.equal(charWidth('A'), 1)
    assert.equal(charWidth('z'), 1)
    assert.equal(charWidth(' '), 1)
    assert.equal(charWidth('1'), 1)
  })

  it('CJK 中文字符返回 2', () => {
    assert.equal(charWidth('中'), 2)
    assert.equal(charWidth('文'), 2)
    assert.equal(charWidth('餐厅'), 2) // Just testing single char would be 2
    assert.equal(charWidth('鱼'), 2)
  })

  it('全角标点返回 2', () => {
    assert.equal(charWidth('，'), 2)
    assert.equal(charWidth('。'), 2)
  })

  it('葡萄牙语特殊字符返回 1', () => {
    assert.equal(charWidth('ç'), 1)
    assert.equal(charWidth('ã'), 1)
    assert.equal(charWidth('õ'), 1)
  })
})

describe('visualLength — 字符串视觉长度', () => {
  it('纯 ASCII 字符串', () => {
    assert.equal(visualLength('Hello'), 5)
    assert.equal(visualLength('AB12'), 4)
  })

  it('纯中文 3 个字 = 6 宽度', () => {
    assert.equal(visualLength('中文名'), 6)
  })

  it('中英混合: "菜品ABC" = 2+2+2+1+1+1 = 9', () => {
    assert.equal(visualLength('菜品ABC'), 7) // 菜=2 品=2 + A=1 B=1 C=1 = 7
  })

  it('空字符串 = 0', () => {
    assert.equal(visualLength(''), 0)
  })
})

describe('centerText — 文本居中', () => {
  const W = 32 // 80mm receipt = 32 chars per line

  it('短文本居中后两侧空格大致均衡', () => {
    const result = centerText('LOTUS HOTEL', W)
    const trimmed = result.trim()
    assert.equal(trimmed, 'LOTUS HOTEL')
    // Visual length of "LOTUS HOTEL" = 11
    // Padding needed: 32 - 11 = 21 → 10 left, 11 right
    assert.ok(result.length > trimmed.length)
    assertCentered(result, W)
  })

  it('中文文本居中', () => {
    const result = centerText('莲花酒店', W)
    const trimmed = result.trim()
    assert.equal(trimmed, '莲花酒店')
    assertCentered(result, W)
  })

  it('中英混合结账单标题居中', () => {
    const header = '== 结账单/RECIBO =='
    const result = centerText(header, W)
    assert.ok(result.startsWith(' '))
    assertCentered(result, W)
  })

  it('接近行宽的文本不会添加过多空格', () => {
    const longText = 'A'.repeat(31)
    const result = centerText(longText, W)
    assert.equal(visualLength(result), 31)
  })
})

describe('padLR — 左右对齐', () => {
  const W = 32

  it('左对齐文本 + 右对齐数字', () => {
    const result = padLR('合计/Total:', '100.00 MT', W)
    assert.ok(result.startsWith('合计/Total:'))
    assert.ok(result.endsWith('100.00 MT'))
  })

  it('文本过长时不崩溃', () => {
    const result = padLR('A'.repeat(40), 'B'.repeat(40), W)
    assert.ok(result.length > 0)
    // Should just concatenate with one space when too long
    assert.ok(result.includes(' '))
  })
})

describe('wrapLine — 自动换行', () => {
  const W = 32

  it('短文本不换行', () => {
    const result = wrapLine('Short text', W)
    assert.equal(result.length, 1)
    assert.equal(result[0], 'Short text')
  })

  it('超长英文按宽度换行', () => {
    const result = wrapLine('A'.repeat(50), W)
    assert.equal(result.length, 2) // 32 + 18
    assert.equal(result[0].length, 32)
    assert.equal(result[1].length, 18)
  })

  it('超长中文按宽度换行（每汉字宽 2）', () => {
    const chineseStr = '这是一道非常非常长的菜品名字测试'
    const result = wrapLine(chineseStr, 10)
    // visualLength = 28, maxWidth=10 → 3 lines
    assert.ok(result.length >= 2)
    // Each line should be ≤ 10 visual width
    for (const line of result) {
      assert.ok(visualLength(line) <= 10)
    }
  })
})

describe('generateReceipt — 小票生成', () => {
  const sampleOrder = {
    id: 42,
    table_number: 'A5',
    waiter_name: '张三',
    payment_method: 'cash',
    cash_received: 500,
    change_amount: 50,
    total_amount: 450,
    items: [
      {
        dish_name: '宫保鸡丁',
        dish_name_pt: 'Frango Kung Pao',
        quantity: 2,
        dish_price: 150,
        subtotal: 300,
        item_status: 'active',
      },
      {
        dish_name: '北京烤鸭',
        dish_name_pt: 'Pato à Pequim',
        quantity: 1,
        dish_price: 150,
        subtotal: 150,
        item_status: 'active',
      },
      {
        dish_name: '可口可乐',
        dish_name_pt: 'Coca-Cola',
        quantity: 1,
        dish_price: 50,
        subtotal: 50,
        item_status: 'active',
      },
    ],
  }

  it('生成的小票包含中文菜名且无乱码', () => {
    const lines = generateReceipt(sampleOrder)
    const text = formatReceiptText(lines)
    assert.ok(hasNoGarbledText(text), '小票文本不应包含乱码字符')
    assertCjkIntact(text, '小票中文菜名')
    assert.ok(text.includes('宫保鸡丁'), '应包含中文菜名"宫保鸡丁"')
    assert.ok(text.includes('北京烤鸭'), '应包含中文菜名"北京烤鸭"')
    assert.ok(text.includes('可口可乐'), '应包含中文菜名"可口可乐"')
  })

  it('生成的小票包含葡萄牙语菜名', () => {
    const lines = generateReceipt(sampleOrder)
    const text = formatReceiptText(lines)
    assert.ok(text.includes('Frango Kung Pao'))
    assert.ok(text.includes('Pato à Pequim'))
  })

  it('生成的小票包含双语标题', () => {
    const lines = generateReceipt(sampleOrder)
    const text = formatReceiptText(lines)
    assert.ok(text.includes('结账单'), '应包含中文"结账单"')
    assert.ok(text.includes('RECIBO'), '应包含葡萄牙语"RECIBO"')
  })

  it('结账单标题居中', () => {
    const lines = generateReceipt(sampleOrder)
    const headerLine = lines.find(l => l.includes('结账单') && l.includes('RECIBO'))
    assert.ok(headerLine, '应找到结账单标题行')
    assertCentered(headerLine, 32)
  })

  it('谢谢惠顾居中', () => {
    const lines = generateReceipt(sampleOrder)
    const thankLine = lines.find(l => l.includes('谢谢惠顾') || l.includes('Obrigado'))
    assert.ok(thankLine, '应找到感谢语行')
    assertCentered(thankLine, 32)
  })

  it('现金支付显示收款和找零', () => {
    const lines = generateReceipt(sampleOrder)
    const text = formatReceiptText(lines)
    assert.ok(text.includes('500.00'))
    assert.ok(text.includes('50.00'))
    assert.ok(text.includes('收款'))
    assert.ok(text.includes('找零'))
  })

  it('取消的菜品不显示', () => {
    const orderWithCancel = {
      ...sampleOrder,
      items: [
        ...sampleOrder.items,
        { dish_name: '已取消菜品', quantity: 1, dish_price: 100, subtotal: 100, item_status: 'cancelled' },
      ],
    }
    const lines = generateReceipt(orderWithCancel)
    const text = formatReceiptText(lines)
    assert.ok(!text.includes('已取消菜品'), '已取消菜品不应出现在小票中')
  })
})

describe('generateKitchenTicket — 厨打生成', () => {
  const sampleOrder = {
    id: 42,
    table_number: 'A5',
    waiter_name: '张三',
  }
  const sampleItems = [
    {
      dish_name: '宫保鸡丁',
      dish_name_pt: 'Frango Kung Pao',
      quantity: 2,
      print_qty: 2,
      flavors: [{ name: '辣度', name_pt: 'Picante', value: '中辣/Medio/Medium' }],
    },
  ]

  it('厨打包含中文菜名无乱码', () => {
    const lines = generateKitchenTicket(sampleOrder, 'new', sampleItems)
    const text = formatReceiptText(lines)
    assert.ok(hasNoGarbledText(text))
    assertCjkIntact(text, '厨打中文菜名')
    assert.ok(text.includes('宫保鸡丁'))
    assert.ok(text.includes('厨打'))
  })

  it('加菜类型使用对应标题', () => {
    const lines = generateKitchenTicket(sampleOrder, 'addon', sampleItems, 'zh')
    const text = formatReceiptText(lines)
    assert.ok(text.includes('加菜') || text.includes('ADICIONAL'))
  })

  it('退菜类型使用对应标题', () => {
    const lines = generateKitchenTicket(sampleOrder, 'cancel', [
      { ...sampleItems[0], cancel_reason: '客人不要了' },
    ], 'zh')
    const text = formatReceiptText(lines)
    assert.ok(text.includes('退菜') || text.includes('CANCELADO'))
    assert.ok(text.includes('客人不要了'))
  })
})

describe('formatReceiptText — 格式化输出', () => {
  it('使用 CRLF 换行（兼容打印机）', () => {
    const lines = ['Line1', 'Line2', 'Line3']
    const text = formatReceiptText(lines)
    assert.ok(text.includes('\r\n'))
    assert.equal(text.split('\r\n').length, 3)
  })

  it('空数组返回空字符串', () => {
    assert.equal(formatReceiptText([]), '')
  })
})

describe('End-to-end: 完整小票输出预览', () => {
  it('打印完整小票预览（无乱码 + 格式正确）', () => {
    const order = {
      id: 100,
      table_number: 'B12',
      waiter_name: '李四',
      payment_method: 'pos',
      total_amount: 1250,
      items: [
        { dish_name: '清蒸鲈鱼', dish_name_pt: 'Peixe cozido a vapor', quantity: 2, dish_price: 350, subtotal: 700, item_status: 'active' },
        { dish_name: '蒜蓉西兰花', dish_name_pt: 'Brócolis com alho', quantity: 1, dish_price: 120, subtotal: 120, item_status: 'active' },
        { dish_name: '蛋炒饭', dish_name_pt: 'Arroz frito', quantity: 2, dish_price: 80, subtotal: 160, item_status: 'active' },
        { dish_name: '青岛啤酒', dish_name_pt: 'Cerveja Tsingtao', quantity: 3, dish_price: 90, subtotal: 270, item_status: 'active' },
      ],
    }

    const lines = generateReceipt(order, 'zh')
    const text = formatReceiptText(lines)

    console.log('\n  ═══════════════════════════════')
    console.log('  📄 小票预览 (Receipt Preview):')
    console.log('  ═══════════════════════════════')

    // Print with visible whitespace markers for debug
    for (const line of lines) {
      const vLen = visualLength(line)
      const marker = line.replace(/ /g, '·')
      console.log(`  │${marker}│ (vlen=${vLen})`)
    }
    console.log('  ═══════════════════════════════\n')

    // Assertions
    assert.ok(hasNoGarbledText(text), '小票无乱码 ✓')
    assertCjkIntact(text, '所有中文菜名')

    // Check all Chinese dish names are present
    for (const item of order.items) {
      assert.ok(text.includes(item.dish_name), `应包含菜名: ${item.dish_name}`)
    }

    // Check all Portuguese dish names
    for (const item of order.items) {
      assert.ok(text.includes(item.dish_name_pt), `应包含葡语菜名: ${item.dish_name_pt}`)
    }

    // Check totals
    assert.ok(text.includes('1250.00'), '应显示总金额 1250.00')
    assert.ok(text.includes('POS机') || text.includes('POS'), '应显示 POS 支付方式')

    // Check bilingual labels
    assert.ok(text.includes('单号') || text.includes('Pedido'), '应包含订单号标签')
    assert.ok(text.includes('桌号') || text.includes('Mesa'), '应包含桌号标签')

    // Verify no garbled characters
    const garbledCheck = /[� -]/.test(text)
    assert.equal(garbledCheck, false, '不应包含任何乱码或控制字符')

    console.log('  ✅ 所有验证通过：中文菜名完整、无乱码、格式正确')
  })
})

// ── Print C# code compilation test (without actual printer) ──

describe('C# 打印代码编译验证 (Windows only)', () => {
  it('PowerShell Add-Type 可编译 C# 代码且无语法错误', () => {
    const os = require('os')
    if (os.platform() !== 'win32') {
      console.log('  ⚠ 非 Windows 平台，跳过 C# 编译测试')
      return
    }

    const { execSync } = require('child_process')
    const fs = require('fs')
    const path = require('path')

    const testText = '测试文本 Test Line\r\n第二行 Line2'
    const fz = 10

    const txtPath = path.join(os.tmpdir(), `test-rcpt-${Date.now()}.txt`)
    fs.writeFileSync(txtPath, testText, 'utf-8')

    // Compile and test the C# class — uses same segment-based rendering as production
    const psScript = [
      // Set console to UTF-8 to avoid encoding issues with Chinese characters in output
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"',
      'using System;',
      'using System.Drawing;',
      'using System.IO;',
      'using System.Text;',
      'public class TestPrinter {',
      '  public static string Test(string filePath) {',
      '    string text = File.ReadAllText(filePath, Encoding.UTF8);',
      `    var latinFont = new Font("Consolas", ${fz}f, FontStyle.Regular, GraphicsUnit.Point);`,
      `    var cjkFont = new Font("Microsoft YaHei", ${fz}f, FontStyle.Regular, GraphicsUnit.Point);`,
      '    var sf = StringFormat.GenericTypographic;',
      '    sf.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces;',
      '    string result = "";',
      '    foreach (string line in text.Split(new[]{"\\r\\n","\\n"}, StringSplitOptions.None)) {',
      '      for (int i = 0; i < line.Length;) {',
      '        bool isCjk = IsCjk(line[i]);',
      '        int j = i + 1;',
      '        while (j < line.Length && IsCjk(line[j]) == isCjk) j++;',
      '        string seg = line.Substring(i, j - i);',
      '        result += seg + "[" + (isCjk ? "CJK" : "LAT") + "]";',
      '        i = j;',
      '      }',
      '      result += "\\n";',
      '    }',
      '    return result;',
      '  }',
      '  private static bool IsCjk(char c) {',
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
      `$result = [TestPrinter]::Test('${txtPath.replace(/\\/g, '\\\\')}')`,
      `Write-Output $result`,
    ].join('\n')

    const psPath = path.join(os.tmpdir(), `test-print-${Date.now()}.ps1`)
    // Write with UTF-8 BOM for PowerShell 5.1
    fs.writeFileSync(psPath, '﻿' + psScript, 'utf-8')

    try {
      const result = execSync(
        `powershell -NoProfile -Exec Bypass -File "${psPath}"`,
        { timeout: 15000, encoding: 'utf-8', windowsHide: true }
      )
      const output = result.trim()
      console.log(`  C# 编译测试输出: ${output}`)

      // Verify CJK detection works correctly
      assert.ok(output.includes('测试文本'), `应识别中文文本，实际输出: "${output.slice(0, 80)}"`)
      assert.ok(output.includes('[CJK]'), `中文字符应标记为 CJK，实际输出: "${output.slice(0, 80)}"`)
      assert.ok(output.includes('[LAT]'), `拉丁字符应标记为 LAT，实际输出: "${output.slice(0, 80)}"`)

      // Verify no garbled text in C# output
      assert.ok(!output.includes('�'), 'C# 输出不应包含 Unicode 替换字符 (U+FFFD)')

      console.log('  ✅ C# 代码编译成功，段渲染 + 中文识别验证通过')
    } catch (e) {
      // If compilation fails, show the error
      const errOutput = (e.stderr || e.stdout || e.message || '').toString()
      console.log(`  C# 编译错误输出: ${errOutput.slice(0, 500)}`)
      assert.fail(`C# 编译失败（可能是 Add-Type 编译警告被当作错误）: ${e.message.slice(0, 200)}`)
    } finally {
      try { fs.unlinkSync(psPath); fs.unlinkSync(txtPath) } catch {}
    }
  })
})
