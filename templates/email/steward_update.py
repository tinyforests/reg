"""Steward seasonal update: the Ecological Registry email template.

First used for Bush Garden, 2 Nov 2026 ("Bush Garden - Spring Update").
Gmail-safe: tables and inline styles only, no images, no SVG, light
palette (Gmail drops dark backgrounds). Direct links only.

Sections, in order:
  1. Header strip: Registry mark, garden, "<Season> update", date
  2. Lead story: one recent, reliable sighting near the garden, why it's
     interesting now (sourced), and a link to the garden's own plants
  3. <Season> at <garden> so far: four stat cards with bars vs the
     30-year typical (rain, hot days, soil moisture, soil temperature)
  4. Spring warmth: weeks ahead/behind, with a timeline bar
  5. Tomorrow: first light and sunrise
  6. Also recorded around <garden>: up to four sightings, tagged by group
  7. Lookups: places looked up near the garden on findmyevc.com
  8. Studio panel (e.g. Signal) with a button
  9. "Add your own sightings" button, sign-off, scorecard, fine print
Rules: plain language only (no degree days, no m3/m3); share, don't ask
(except the studio panel's reply invitation); sightings are "the
surrounding area", never the garden; figures say they are estimates.

Values below are the Bush Garden example. Run: python3 steward_update.py
"""
INK='#2b2f26'; MUTE='#6f7666'; LINE='#e3d8c3'; PAPER='#fbf6ec'; CARD='#f4ecdc'; GREEN='#5f7f47'; LIGHT='#9cbf7e'; GREY='#cfc5b0'
F_SERIF="Georgia,'Times New Roman',serif"; F_SANS="Helvetica,Arial,sans-serif"; F_MONO="Menlo,Consolas,monospace"
PROFILE='https://ecologicalregistry.org/gardens/g-a8fd930bda96/index.html'; SIGN='https://ecologicalregistry.org/sign/'

def bar(pct, color, h=10):
    pct=max(2,min(100,round(pct)))
    rest=100-pct
    cells=f'<td width="{pct}%" bgcolor="{color}" style="background-color:{color};height:{h}px;line-height:{h}px;font-size:0">&nbsp;</td>'
    if rest: cells+=f'<td width="{rest}%" style="height:{h}px;line-height:{h}px;font-size:0">&nbsp;</td>'
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>{cells}</tr></table>'

def stat(label, big, unit, note, now, typ, scale, typ_label):
    return f'''<td width="50%" valign="top" style="padding:14px 14px 16px;border:1px solid {LINE};background-color:#ffffff" bgcolor="#ffffff">
  <div style="font:600 11px/1.4 {F_SANS};letter-spacing:.08em;text-transform:uppercase;color:{MUTE}">{label}</div>
  <div style="font:400 30px/1.15 {F_SERIF};color:{INK};margin:6px 0 2px">{big}<span style="font:14px {F_SANS};color:{MUTE}"> {unit}</span></div>
  <div style="font:13px/1.45 {F_SANS};color:{INK};margin:0 0 10px">{note}</div>
  <div style="font:11px/1.6 {F_SANS};color:{MUTE}">This spring</div>{bar(now/scale*100, GREEN)}
  <div style="font:11px/1.6 {F_SANS};color:{MUTE};margin-top:4px">{typ_label}</div>{bar(typ/scale*100, GREY)}
</td>'''

def pill(text, color):
    return f'<span style="display:inline-block;font:600 10px/1 {F_SANS};letter-spacing:.08em;text-transform:uppercase;color:#ffffff;background-color:{color};padding:4px 7px;border-radius:2px">{text}</span>'

def sighting(kind, color, name, sci, where, when):
    return f'''<tr><td style="padding:11px 0;border-bottom:1px solid {LINE}" valign="top" width="96">{pill(kind,color)}</td>
<td style="padding:11px 0 11px 10px;border-bottom:1px solid {LINE};font:15px/1.4 {F_SANS};color:{INK}" valign="top"><b>{name}</b> <i style="color:{MUTE}">{sci}</i><br><span style="font-size:13px;color:{MUTE}">{where} · {when}</span></td></tr>'''

def sensor(name, what):
    return f'<td width="33%" valign="top" style="padding:10px 10px 10px 0"><div style="font:600 13px/1.3 {F_SANS};color:{INK}"><span style="color:{GREEN}">●</span> {name}</div><div style="font:12px/1.4 {F_SANS};color:{MUTE};margin-top:3px">{what}</div></td>'

def btn(text, href, solid=True):
    bg = GREEN if solid else '#ffffff'; fg = '#ffffff' if solid else INK; bd = GREEN if solid else INK
    return f'<a href="{href}" style="display:inline-block;font:600 14px/1 {F_SANS};color:{fg};background-color:{bg};border:1px solid {bd};padding:13px 18px;text-decoration:none;border-radius:2px">{text}</a>'

# Warmth timeline: 1 Aug .. 31 Dec (153 days). Today 2 Nov = day 93; typical date for this warmth 19 Nov = day 110.
tl_total=153; today=93; typical=110
def timeline():
    a=round(today/tl_total*100); b=round((typical-today)/tl_total*100); c=100-a-b
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
<td width="{a}%" bgcolor="{GREEN}" style="background-color:{GREEN};height:14px;font-size:0">&nbsp;</td>
<td width="{b}%" bgcolor="{LIGHT}" style="background-color:{LIGHT};height:14px;font-size:0">&nbsp;</td>
<td width="{c}%" bgcolor="{GREY}" style="background-color:{GREY};height:14px;font-size:0">&nbsp;</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:11px/1.5 {F_SANS};color:{MUTE};margin-top:5px"><tr>
<td width="{a}%" valign="top">1 Aug</td><td width="{b}%" valign="top" style="color:{INK}"><b>Today, 2 Nov</b></td><td width="{c}%" valign="top" align="left">Typical year reaches today's warmth on <b style="color:{INK}">19 Nov</b></td></tr></table>'''

html=f'''<div style="background-color:{PAPER};padding:0;margin:0" bgcolor="{PAPER}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="{PAPER}" style="background-color:{PAPER}"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:collapse">

<tr><td style="padding:0 0 14px;border-bottom:2px solid {INK}">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="font:600 11px/1.4 {F_MONO};letter-spacing:.12em;text-transform:uppercase;color:{INK}">Ecological Registry <span style="color:{GREEN}">●</span></td>
  <td align="right" style="font:11px/1.4 {F_MONO};letter-spacing:.08em;text-transform:uppercase;color:{MUTE}">Bush Garden · Spring update · 2 Nov 2026</td></tr></table>
</td></tr>

<tr><td style="padding:26px 0 8px">
 <div style="font:15px/1.6 {F_SANS};color:{INK};margin:0 0 18px">Hi Sam,</div>
 <div style="font:600 11px/1.4 {F_SANS};letter-spacing:.1em;text-transform:uppercase;color:{GREEN}">Recorded nearby · 18 October</div>
 <div style="font:400 34px/1.15 {F_SERIF};color:{INK};margin:8px 0 12px">A Bogong Moth, about 3km from Bush Garden</div>
 <div style="font:16px/1.6 {F_SERIF};color:{INK};margin:0 0 12px">Bogong Moths fly each spring from inland Queensland, New South Wales and western Victoria to the Australian Alps, and can turn up around Melbourne on the way.</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="{CARD}" style="background-color:{CARD};border-left:3px solid {GREEN}"><tr><td style="padding:12px 14px;font:15px/1.5 {F_SANS};color:{INK}">The <b>Correas and eucalypts</b> growing at Bush Garden are among the native plants Bogong Moths feed on.</td></tr></table>
</td></tr>

<tr><td style="padding:30px 0 6px">
 <div style="font:400 24px/1.2 {F_SERIF};color:{INK}">Spring at Bush Garden so far</div>
 <div style="font:13px/1.5 {F_SANS};color:{MUTE};margin-top:4px">Compared with the same weeks in each of the past 30 years.</div>
</td></tr>
<tr><td style="padding:10px 0 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 0">
  <tr>{stat("Rain", "157", "mm", "A little wetter than a typical spring.", 157, 148, 180, "Typical: 148mm")}
      {stat("Hot days", "6", "days over 25°C", "Twice as many as usual.", 6, 3, 8, "Usual: 3")}</tr>
  <tr>{stat("Soil moisture", "Normal", "", "The 25 October rain soaked in well and the soil has been drying slowly since. Right now it's holding about as much water as usual.", 35, 34, 45, "Typical for this date")}
      {stat("Soil temperature", "16.5", "°C at root depth", "Nearly 2°C warmer than usual.", 16.5, 14.7, 20, "Typical: 14.7°C")}</tr>
 </table>
</td></tr>

<tr><td style="padding:16px 0 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid {LINE}"><tr><td style="padding:14px 14px 16px">
  <div style="font:600 11px/1.4 {F_SANS};letter-spacing:.08em;text-transform:uppercase;color:{MUTE}">Spring warmth</div>
  <div style="font:400 24px/1.2 {F_SERIF};color:{INK};margin:6px 0 4px">About 2½ weeks ahead</div>
  <div style="font:13px/1.45 {F_SANS};color:{INK};margin:0 0 12px">Bush Garden has had as much warmth since 1 August as it usually gets by 19 November, so growth and flowering are likely running early.</div>
  {timeline()}
 </td></tr></table>
</td></tr>

<tr><td style="padding:12px 0 0;font:13px/1.5 {F_SANS};color:{MUTE}">Tomorrow: first light <b style="color:{INK}">5:43am</b>, sunrise <b style="color:{INK}">6:10am</b>.</td></tr>

<tr><td style="padding:32px 0 6px">
 <div style="font:400 24px/1.2 {F_SERIF};color:{INK}">Also recorded around Bush Garden</div>
 <div style="font:13px/1.5 {F_SANS};color:{MUTE};margin-top:4px">In the past few weeks, in the surrounding area.</div>
</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid {LINE}">
 {sighting("Orchid","#8a6aa8","Wallflower Donkey Orchid","Diuris orientis","About 4.5km away","9 October")}
 {sighting("Mammal","#8a6a4f","Short-beaked Echidna","Tachyglossus aculeatus","About 5km away","15 October")}
 {sighting("Bird","#b0574a","Gang-gang Cockatoo","Callocephalon fimbriatum","About 2.5km away","17 October")}
 {sighting("Wildflower","#4f7fa8","Blue Pincushion","Brunonia australis","About 3.5km away","18 October")}
</table></td></tr>

<tr><td style="padding:24px 0 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="{CARD}" style="background-color:{CARD}"><tr>
  <td width="96" align="center" valign="middle" style="padding:16px 0;font:400 40px/1 {F_SERIF};color:{GREEN}">9</td>
  <td valign="middle" style="padding:16px 16px 16px 0;font:14px/1.5 {F_SANS};color:{INK}">Since September, people have looked up what originally grew at <b>9 places within 10km</b> of Bush Garden on <a href="https://findmyevc.com" style="color:{INK}">findmyevc.com</a>, and at <b>323 places</b> across Victoria.</td>
 </tr></table>
</td></tr>

<tr><td style="padding:32px 0 0">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid {INK}"><tr><td style="padding:20px 18px 20px">
  <div style="font:600 11px/1.4 {F_SANS};letter-spacing:.1em;text-transform:uppercase;color:{GREEN}">Something we're building</div>
  <div style="font:400 28px/1.15 {F_SERIF};color:{INK};margin:8px 0 8px">Signal: a garden sign that measures the garden</div>
  <div style="font:15px/1.55 {F_SANS};color:{INK};margin:0 0 6px">The spring figures above are estimates for your area. Signal would measure them in the garden itself, and show the garden's record at the gate.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px"><tr>
   {sensor("Soil moisture","15cm under the mulch")}{sensor("Soil temperature","at root depth")}{sensor("Rain gauge","what actually fell")}</tr><tr>
   {sensor("Air and humidity","under the canopy")}{sensor("Light","in the understorey")}{sensor("Birdsong","identified on the sign, no audio kept")}</tr></table>
  <div style="font:15px/1.55 {F_SANS};color:{INK};margin:12px 0 16px">With no irrigation and everything riding on mulch and mounding, Bush Garden is exactly where we'd love the first one to go. If you'd like it there, just reply.</div>
  {btn("See the Signal prototype", SIGN)}
 </td></tr></table>
</td></tr>

<tr><td style="padding:22px 0 0">{btn("Add your own sightings to Bush Garden's record", PROFILE, False)}</td></tr>

<tr><td style="padding:26px 0 0;font:15px/1.6 {F_SERIF};color:{INK}">Tyson &amp; Natasha<br><span style="font:13px {F_SANS};color:{MUTE}">Ecological Registry</span></td></tr>

<tr><td style="padding:24px 0 0">
 <table role="presentation" cellpadding="0" cellspacing="0" bgcolor="{CARD}" style="width:100%;max-width:300px;background-color:{CARD};border:1px solid #d9ccb2"><tr><td style="padding:14px 16px">
  <div style="font:11px/1.5 {F_MONO};letter-spacing:.1em;text-transform:uppercase;color:#5b6152">Ecological Registry <span style="color:{GREEN}">●</span></div>
  <div style="font:16px/1.3 {F_SANS};color:{INK};margin-top:8px">Bush Garden</div>
  <div style="font:11px/1.6 {F_MONO};text-transform:uppercase;color:{GREEN}">Ecosystem Garden</div>
  <div style="font:500 44px/1.1 {F_MONO};color:{GREEN};margin-top:4px">83<span style="font-size:12px;color:#8a8f80"> / 100</span></div>
  <a href="{PROFILE}" style="display:block;margin-top:8px;font:13px/1.5 {F_SANS};color:{INK}">View your garden's record ↗</a>
 </td></tr></table>
</td></tr>

<tr><td style="padding:24px 0 8px;font:11px/1.6 {F_SANS};color:{MUTE}">Part of our Ecological Registry steward pilot. Sightings are from the surrounding area, not from your garden, via the Atlas of Living Australia. Weather and soil figures are estimates for your location from Open-Meteo. Reply "pause" and we'll stop these notes.</td></tr>

</table></td></tr></table></div>'''
open('steward_update.example.html','w').write(html)
print(len(html.encode()),'bytes')
