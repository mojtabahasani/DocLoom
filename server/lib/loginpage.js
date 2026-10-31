// Minimal Persian RTL PIN page for LAN clients without a session (styled like the app: Vazirmatn fallback stack, green accent).
export const loginPage = () => `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><meta name="color-scheme" content="light dark"><title>MD2Html | ورود</title>
<style>
:root{--bg:#eef2ef;--surface:#fff;--line:#dfe7e2;--text:#17302f;--muted:#6c7f7b;--accent:#1f6f5f;--accent-strong:#165548;--ring:#7fc3a9;--danger:#b4443c;--danger-soft:#fbeceb}
@media(prefers-color-scheme:dark){:root{--bg:#0e1815;--surface:#16231f;--line:#27382f;--text:#e6f0ec;--muted:#93a8a1;--accent:#3f9d86;--accent-strong:#58b9a1;--ring:#2c6b5c;--danger:#e0766d;--danger-soft:#3a1f1d}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--text);font:14px/1.9 Vazirmatn,"Segoe UI",Tahoma,Arial,sans-serif}
.card{width:min(380px,100%);background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:26px 22px;box-shadow:0 10px 30px rgba(20,50,42,.12);text-align:center}
.logo{width:48px;height:48px;border-radius:13px;margin:0 auto 10px;display:grid;place-items:center;color:#fff;font-weight:700;background:linear-gradient(135deg,#1a6256,#51aa8b)}
h1{font-size:18px;margin:0 0 4px}p{margin:0 0 16px;color:var(--muted);font-size:13px}
input{width:100%;font:inherit;font-size:26px;letter-spacing:.5em;text-align:center;padding:10px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--text);direction:ltr}
input:focus{outline:2px solid var(--ring);border-color:var(--accent)}
button{margin-top:14px;width:100%;font:inherit;font-weight:700;padding:11px;border:0;border-radius:11px;background:var(--accent);color:#fff;cursor:pointer}
button:hover{background:var(--accent-strong)}button:disabled{opacity:.5;cursor:default}
.err{margin-top:12px;padding:8px 10px;border-radius:9px;background:var(--danger-soft);color:var(--danger);font-size:13px}
</style></head><body>
<form class="card" id="f" autocomplete="off">
<div class="logo" aria-hidden="true">MD</div>
<h1>MD2Html</h1><p>رمز ۶ رقمی را وارد کنید. (اگر آن را ندارید، روی مک «md2html pin» بزنید یا از پنل سرور رمز جدید بگیرید.)</p>
<input id="pin" name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" aria-label="رمز ۶ رقمی" autofocus>
<button id="go" type="submit">ورود</button>
<div class="err" id="err" role="alert" hidden></div>
</form>
<script>
(function(){
var f=document.getElementById('f'),pin=document.getElementById('pin'),err=document.getElementById('err'),go=document.getElementById('go');
function show(t){err.textContent=t;err.hidden=false}
f.addEventListener('submit',function(e){
e.preventDefault();err.hidden=true;
var v=pin.value.replace(/[۰-۹]/g,function(c){return String(c.charCodeAt(0)-1776)});
if(!/^\\d{6}$/.test(v)){show('رمز باید ۶ رقم باشد.');return}
go.disabled=true;
fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-MD2Html':'1'},body:JSON.stringify({pin:v})})
.then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})})
.then(function(r){
if(r.s===200){location.replace('/');return}
if(r.s===429){show('تلاش‌های ناموفق زیاد بود؛ حدود '+Math.ceil((r.j.retryAfter||900)/60).toString().replace(/\\d/g,function(d){return '۰۱۲۳۴۵۶۷۸۹'[d]})+' دقیقه بعد دوباره امتحان کنید.')}
else show('رمز اشتباه است.'+(typeof r.j.left==='number'?' '+r.j.left.toString().replace(/\\d/g,function(d){return '۰۱۲۳۴۵۶۷۸۹'[d]})+' تلاش دیگر مانده.':''));
pin.value='';pin.focus();go.disabled=false})
.catch(function(){show('اتصال به سرور برقرار نشد.');go.disabled=false});
});
})();
</script></body></html>`;
