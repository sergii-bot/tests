# Cache-busting for GitHub Pages: every push gets fresh files.
# Pages lets browsers keep files for 10 minutes, and ES modules are cached hard, so visitors could see
# a mix of old and new code. At deploy time (never in the repo) this appends ?v=<commit> to every
# relative import / script / stylesheet / JSON URL in our own code. Vendor files are left alone so
# three.js is still loaded exactly once (vendor files import each other without a version).
import os, re, sys

root, v = sys.argv[1], sys.argv[2][:8]
quoted = re.compile(r"""((?:\bfrom\s*|\bimport\s*\(\s*|\bsrc=|\bhref=|\bfetch\(\s*)['"])(\.{1,2}/[^'"?#]+?\.(?:js|mjs|css|json))(['"])""")
templ = re.compile(r"(\bimport\(\s*`)(\.{1,2}/[^`?#]+?\.js)(`)")
# bare relative attribute URLs too (e.g. sim.html: src="gate.js"); never absolute, protocol, root or fragment URLs
bare = re.compile(r'''(\b(?:src|href)=["'])((?![a-zA-Z][\w+.-]*:|/|#|\.)[^"'?#\s]+\.(?:js|mjs|css))(["'])''')
changed = 0
for d, _, files in os.walk(root):
    if 'vendor' in d.split(os.sep):
        continue
    for f in files:
        if not f.endswith(('.js', '.mjs', '.html', '.css')):
            continue
        p = os.path.join(d, f)
        s = open(p, encoding='utf-8').read()
        bump = lambda m: m.group(0) if 'vendor/' in m.group(2) else m.group(1) + m.group(2) + '?v=' + v + m.group(3)
        n = bare.sub(bump, templ.sub(bump, quoted.sub(bump, s)))
        if n != s:
            open(p, 'w', encoding='utf-8').write(n); changed += 1
print(f'versioned URLs in {changed} files (v={v})')
