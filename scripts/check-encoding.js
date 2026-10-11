#!/usr/bin/env node
/**
 * check-encoding.js — 编码体检
 *
 * QuickApp Studio 用自己的 SFC/JSON 解析器读取 src/，对 UTF-8 BOM 比 CLI 构建链更严格：
 *   - manifest.json 带 BOM -> JSON.parse 直接抛 "Unexpected token ﻿"
 *   - .ux 带 BOM           -> <template>/<script> 前多出不可见字符，导致页面解析失败或空白
 * 因此在构建前拦截，避免"能 build 但 Studio 预览空白/报错"。
 *
 * 用法: node scripts/check-encoding.js
 */

const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const SRC = path.join(ROOT, "src")
const SUFFIXES = new Set([".ux", ".json", ".js"])

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // dict/ 是生成的大型数据目录，不参与源码体检
      if (entry.name === "dict") continue
      walk(full, out)
    } else if (entry.isFile() && SUFFIXES.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
  return out
}

const problems = []

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file)
  const buf = fs.readFileSync(file)

  if (buf.subarray(0, 3).equals(BOM)) {
    problems.push(`${rel}: 含 UTF-8 BOM（Studio 解析会失败）`)
  }

  if (buf.includes(Buffer.from("\r\n"))) {
    problems.push(`${rel}: 含 CRLF 换行`)
  }

  const text = buf.toString("utf8")
  // U+FFFD 说明存在非法字节序列
  if (text.includes("�")) {
    problems.push(`${rel}: 含非法 UTF-8 字节序列`)
  }

  // JSON 严格解析（复现 JS JSON.parse 行为）
  if (path.extname(file) === ".json") {
    try {
      JSON.parse(text)
    } catch (e) {
      problems.push(`${rel}: JSON 解析失败 -> ${e.message}`)
    }
  }
}

if (problems.length) {
  console.error("❌ 编码体检未通过：")
  for (const p of problems) console.error("   - " + p)
  console.error("\n修复方式：用 UTF-8(无 BOM) + LF 保存上述文件。")
  process.exit(1)
}

console.log("✅ 编码体检通过：无 BOM / 无 CRLF / JSON 均可解析")
