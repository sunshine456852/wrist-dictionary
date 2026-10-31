#!/usr/bin/env node
/**
 * check-profile-classes.js — 构建前体检
 *
 * 背景
 * ----
 * 模板里写作 class="page page-{{screenProfile}}"，运行时会展开成
 * ["page", "page-<profile>"]。若 <style> 里没有 page-<profile> 这一条，
 * 运行时按类名查样式表会取到 undefined，继续取其 .style 就抛
 * "cannot read property 'style' of undefined"，表现为首页启动即 Abort App。
 *
 * 手表构建走 TARGET_ID=W432X514 -> profile=rect，而 rect 的类恰好齐全，
 * 所以表上不报错；QuickApp Studio 预览不带 TARGET_* 环境变量，
 * 落到默认值 pill-standard，就暴露出缺失的类。
 *
 * 用法: node scripts/check-profile-classes.js   （缺失时 exit 1）
 */

const fs = require("fs")
const path = require("path")

const PROFILES = ["pill-standard", "pill-compact", "rect", "circle"]
const SRC = path.resolve(__dirname, "../src/pages")

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile() && entry.name.endsWith(".ux")) {
      out.push(full)
    }
  }
  return out
}

function analyze() {
  const problems = []
  let checked = 0

  for (const file of walk(SRC)) {
    const txt = fs.readFileSync(file, "utf8")
    if (!txt.includes("<style>")) continue

    const style = txt.slice(txt.indexOf("<style>"), txt.indexOf("</style>"))

    // 模板中通过 {{screenProfile}} 引用的类前缀
    const prefixes = new Set()
    const classRe = /class="([^"]*\{\{screenProfile\}\}[^"]*)"/g
    let m
    while ((m = classRe.exec(txt)) !== null) {
      for (const tok of m[1].split(/\s+/)) {
        if (tok.includes("{{screenProfile}}")) {
          prefixes.add(tok.replace("{{screenProfile}}", ""))
        }
      }
    }
    if (prefixes.size === 0) continue

    checked++
    const defined = new Set()
    const defRe = /\.([A-Za-z][A-Za-z0-9_-]*)/g
    while ((m = defRe.exec(style)) !== null) defined.add(m[1])

    for (const prof of PROFILES) {
      const miss = [...prefixes].map((p) => p + prof).filter((c) => !defined.has(c)).sort()
      if (miss.length) problems.push({ file, prof, miss })
    }
  }

  return { checked, problems }
}

const { checked, problems } = analyze()

if (problems.length) {
  console.error("❌ profile 变体类缺失（会导致运行时 style of undefined 闪退）:")
  for (const p of problems) {
    console.error(`   ${path.relative(process.cwd(), p.file)} [${p.prof}] 缺 ${p.miss.length}: ${p.miss.join(", ")}`)
  }
  console.error("\n修复：为对应基础类补一个同名变体选择器，例如")
  console.error("   .page,\n   .page-pill-standard { ... }")
  process.exit(1)
}

console.log(`✅ profile 变体类体检通过：${checked} 个页面 × ${PROFILES.length} 种 profile 全部覆盖`)
