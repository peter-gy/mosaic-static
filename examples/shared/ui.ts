export function page(
  root: HTMLElement,
  title: string,
  description: string,
  body: string,
) {
  root.innerHTML = `<style>
    :root{color-scheme:light;--ink:#171717;--muted:#666;--line:#e5e5e5}
    *{box-sizing:border-box}
    body{margin:0;background:#fff;color:var(--ink);font:14px/1.5 "Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
    main{max-width:1080px;margin:auto;padding:48px 32px 32px}
    header{margin-bottom:28px}
    h1{font-size:24px;font-weight:600;letter-spacing:-.04em;line-height:1.25;margin:0 0 8px}
    h2{font-size:14px;font-weight:500;line-height:1.5;margin:0}
    p{color:var(--muted);margin:0;line-height:1.6}
    a{color:inherit;text-underline-offset:3px}
    a:hover{color:var(--ink)}
    button,select{font:inherit;color:inherit;background:#fff;border:1px solid var(--line);border-radius:0;min-height:34px;padding:5px 10px;box-shadow:none}
    button{cursor:pointer}
    button:hover,select:hover{border-color:#999}
    :focus-visible{outline:2px solid var(--ink);outline-offset:3px}
    button:disabled,select:disabled{color:var(--muted);opacity:1;cursor:default}
    .toolbar,.panel-heading{display:flex;align-items:center;flex-wrap:wrap;gap:16px}
    .toolbar{margin-bottom:8px}
    .toolbar label{display:flex;align-items:center;gap:8px;color:var(--muted)}
    .toolbar label select{color:var(--ink)}
    .toolbar>button{margin-left:auto}
    .toolbar>.hint{margin-left:auto}
    .toolbar>button:first-child{margin-left:0}
    .panel{padding:24px 0;border-top:1px solid var(--line);min-width:0}
    .panel-heading{justify-content:space-between;margin-bottom:20px}
    .panel-heading select{font-size:13px;min-width:140px}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:32px;padding:28px 0 32px}
    .stats>div{display:flex;flex-direction:column-reverse;gap:8px;min-width:0}
    .stats strong{font-size:28px;font-weight:500;letter-spacing:-.045em;line-height:1.15;font-variant-numeric:tabular-nums}
    .stats small{font-size:13px;color:var(--muted)}
    .chart{min-width:0;color:var(--ink)}
    .chart svg{display:block;width:100%;height:auto;font:12px "Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:40px}
    canvas{display:block;width:100%;height:290px;margin-top:20px;cursor:crosshair}
    table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
    th,td{text-align:left;vertical-align:baseline;padding:11px 0;border-bottom:1px solid var(--line);white-space:nowrap}
    th{color:var(--muted);font-weight:400}
    th:not(:first-child),td:not(:first-child){text-align:right;padding-left:16px}
    .legend{display:flex;flex-wrap:wrap;gap:20px;border-bottom:1px solid var(--line);margin-top:16px}
    .legend button{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);padding:10px 0;margin-bottom:-1px}
    .legend button[aria-pressed=true]{border-bottom-color:var(--ink);color:var(--ink)}
    .legend button:hover{color:var(--ink)}
    .hint{font-size:13px;color:var(--muted)}
    footer{margin-top:20px;font-size:12px;color:var(--muted)}
    output{font-variant-numeric:tabular-nums}
    [role=alert]{margin:16px;border:1px solid var(--ink);padding:16px;white-space:pre-wrap}
    @media(max-width:650px){main{padding:28px 20px}.grid{grid-template-columns:1fr;gap:12px}.stats{gap:16px}.stats strong{font-size:25px}.stats small{font-size:12px;min-height:36px}.panel-heading{gap:12px}.panel-heading select{min-width:130px}.toolbar{gap:12px}.toolbar>.hint{margin-left:0}.legend{gap:18px}}
  </style><header><h1>${title}</h1><p>${description}</p></header>${body}`;
  return <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
}

export const format = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
