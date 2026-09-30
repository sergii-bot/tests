// Minimal XML parser/serializer for MJCF (elements, attributes, comments; no text content needed).
// Shared by extract.mjs (Node) and composer.js (browser + Node), so no DOMParser dependency.
//   const root = parseXML(str);  node = {tag, attrs: {..}, children: [..]};  toXML(node) -> string

export function parseXML(src) {
  src = src.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const re = /<\s*(\/)?\s*([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/)?\s*>/g;
  const attrRe = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const top = {tag: '#root', attrs: {}, children: []}, stack = [top];
  let m;
  while ((m = re.exec(src))) {
    const [, close, tag, attrStr, selfClose] = m;
    if (close) {
      const n = stack.pop();
      if (!n || n.tag !== tag) throw new Error(`XML: mismatched </${tag}>`);
      continue;
    }
    const attrs = {}; let a; attrRe.lastIndex = 0;
    while ((a = attrRe.exec(attrStr))) attrs[a[1]] = decode(a[2] ?? a[3]);
    const node = {tag, attrs, children: []};
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('XML: unclosed element ' + stack[stack.length - 1].tag);
  return top.children.length === 1 ? top.children[0] : top;
}

const decode = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const encode = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toXML(node, indent = '', step = '  ') {
  if (node.tag === '#root') return node.children.map(c => toXML(c, indent, step)).join('\n');
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${encode(v)}"`).join('');
  if (!node.children.length) return `${indent}<${node.tag}${attrs}/>`;
  return `${indent}<${node.tag}${attrs}>\n${node.children.map(c => toXML(c, indent + step, step)).join('\n')}\n${indent}</${node.tag}>`;
}

export const el = (tag, attrs = {}, children = []) => ({tag, attrs, children});
export const clone = n => ({tag: n.tag, attrs: {...n.attrs}, children: n.children.map(clone)});
export function walk(n, fn, parent = null) { fn(n, parent); for (const c of n.children) walk(c, fn, n); }
export const find = (n, pred) => { if (pred(n)) return n; for (const c of n.children) { const r = find(c, pred); if (r) return r; } return null; };
export const findAll = (n, pred, out = []) => { if (pred(n)) out.push(n); for (const c of n.children) findAll(c, pred, out); return out; };
