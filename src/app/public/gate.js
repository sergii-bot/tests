// Password gate (deters casual visitors only; the source is public).
(function () {
  var HASH = '042080bd17d2d2354a09130f3adf78a5722b700a9b643613865e574b24d31114';
  var KEY = 'skild-gate';
  try { if (localStorage.getItem(KEY) === HASH) return; } catch (e) {}
  var st = document.createElement('style');
  st.id = 'gate-hide';
  st.textContent = 'body>*:not(#gate){display:none!important}';
  document.documentElement.appendChild(st);
  function sha(s) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function show() {
    var g = document.createElement('div');
    g.id = 'gate';
    g.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#0e0f11;font-family:system-ui,sans-serif;color:#eee';
    g.innerHTML = '<form style="display:flex;flex-direction:column;gap:12px;width:min(300px,86vw)"><b style="font-size:18px">Skild AI Robotics Lab</b><input type="password" placeholder="Password" autofocus style="padding:12px;border-radius:8px;border:1px solid #444;background:#1a1b1e;color:#fff;font-size:16px"><button style="padding:12px;border-radius:8px;border:0;background:#fff;color:#000;font-weight:600;font-size:15px">Enter</button><span style="color:#f66;font-size:13px;min-height:16px"></span></form>';
    document.body.appendChild(g);
    var f = g.querySelector('form'), i = g.querySelector('input'), m = g.querySelector('span');
    f.onsubmit = function (e) {
      e.preventDefault();
      sha(i.value).then(function (h) {
        if (h !== HASH) { m.textContent = 'Wrong password'; i.value = ''; return; }
        try { localStorage.setItem(KEY, HASH); } catch (e) {}
        g.remove(); st.remove();
      });
    };
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
