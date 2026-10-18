/**
 * First-party page tracker. trackerScript() returns an inline script (~3KB) for <head>.
 *
 * window.groove = { visitorId, sessionId, attribution(), track(name, props), pixel(name, data, eventId), flush() }
 *
 * Beacon (POST beacon.url), batched:
 *   { v: 1, vid, sid, t: clientSlug, pg: pageSlug, path, a: Attribution, ev: [{ n, t, p }] }
 * Sent as text/plain so a cross-origin beacon needs no CORS preflight; the portal parses the body as JSON.
 * Events: page_view, scroll_50, scroll_90, cta_click, call_click, form_start, form_step,
 *   form_submit, video_play, video_25, video_50, video_100.
 * No PII: prop keys that look like contact fields are dropped, and so are values containing "@".
 * landing_url and referrer are stripped to origin + path (+ known ad params only).
 */

export type TrackerOptions = {
  /** Beacon endpoint, site data `beacon.url`. */
  endpoint: string;
  /** Client slug. */
  client: string;
  /** Page slug. */
  page: string;
  /** Meta pixel id. Empty skips the pixel. */
  pixelId?: string | null;
};

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  landing_url: string;
  referrer: string;
  session_id: string;
  fbc?: string;
  fbp?: string;
};

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

export type GrooveGlobal = {
  visitorId: string;
  sessionId: string;
  attribution: () => Attribution;
  track: (name: string, props?: TrackProps) => void;
  pixel: (eventName: string, data?: Record<string, unknown>, eventId?: string) => void;
  flush: () => void;
};

declare global {
  interface Window {
    groove?: GrooveGlobal;
  }
}

const LS = new RegExp(String.fromCharCode(0x2028), "g");
const PS = new RegExp(String.fromCharCode(0x2029), "g");

/** JSON safe to drop inside a <script> tag. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(LS, "\\u2028").replace(PS, "\\u2029");
}

// Ported from groove-portal src/sites/tracker. Hand-minified. Keep it free of backticks and "${".
const BODY = `if(w.groove)return;var E=C.e,Q=[],T,ss;try{ss=w.sessionStorage}catch(e){}
function rid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,10)}
function gc(n){var m=d.cookie.match('(?:^|; )'+n+'=([^;]*)');return m?decodeURIComponent(m[1]):''}
function sc(n,v,days){d.cookie=n+'='+encodeURIComponent(v)+';path=/;max-age='+days*86400+';samesite=lax'+(location.protocol=='https:'?';secure':'')}
function sg(k){try{return ss.getItem(k)}catch(e){return null}}
function sp(k,v){try{ss.setItem(k,v)}catch(e){}}
var vid=gc('gp_vid')||rid();sc('gp_vid',vid,365);
var sid=sg('gp_sid')||rid();sp('gp_sid',sid);
var u=new URL(location.href),q=u.searchParams,K=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','gbraid','wbraid'],a={},hit=0;
K.forEach(function(k){var v=q.get(k);if(v){a[k]=v;hit=1}});
var cq=K.filter(function(k){return a[k]}).map(function(k){return k+'='+encodeURIComponent(a[k])}).join('&');
a.landing_url=u.origin+u.pathname+(cq?'?'+cq:'');
var r='';try{if(d.referrer){var R=new URL(d.referrer);r=R.origin+R.pathname}}catch(e){}a.referrer=r;
if(a.fbclid){var fc=gc('_fbc');if(!fc||fc.split('.').pop()!==a.fbclid)sc('_fbc','fb.1.'+Date.now()+'.'+a.fbclid,90)}
var st=sg('gp_attr');if(hit||!st){st=JSON.stringify(a);sp('gp_attr',st)}var A=JSON.parse(st);
function attribution(){var o={session_id:sid};for(var k in A)o[k]=A[k];var c=gc('_fbc'),p=gc('_fbp');if(c)o.fbc=c;if(p)o.fbp=p;return o}
var P=/phone|email|name|first|last|zip|address|street/i;
function track(n,p){var c={};if(p)for(var k in p){var v=p[k];if(v==null||P.test(k)||(typeof v=='string'&&v.indexOf('@')>-1))continue;c[k]=typeof v=='object'?'':v}
Q.push({n:n,t:Date.now(),p:c});clearTimeout(T);if(Q.length>=10)flush();else T=setTimeout(flush,2000)}
function flush(){if(!Q.length)return;var b=JSON.stringify({v:1,vid:vid,sid:sid,t:C.t,pg:C.p,path:u.pathname,a:attribution(),ev:Q.splice(0)}),ok=false;
try{ok=navigator.sendBeacon(E,new Blob([b],{type:'text/plain;charset=UTF-8'}))}catch(e){}
if(!ok)try{fetch(E,{method:'POST',body:b,keepalive:true,mode:'no-cors',headers:{'content-type':'text/plain;charset=UTF-8'}})}catch(e){}}
d.addEventListener('visibilitychange',function(){if(d.visibilityState=='hidden')flush()});w.addEventListener('pagehide',flush);
var s5=0,s9=0;function os(){var h=d.documentElement,f=(w.scrollY+w.innerHeight)/h.scrollHeight;if(!s5&&f>=.5){s5=1;track('scroll_50')}if(!s9&&f>=.9){s9=1;track('scroll_90');w.removeEventListener('scroll',os)}}
w.addEventListener('scroll',os,{passive:true});
d.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;var l=t.closest('a[href^="tel:"]'),x=t.closest('[data-track]'),id=x?x.getAttribute('data-track'):'';
if(l){track('call_click',{id:id});px('Contact',{},'cc.'+rid())}else if(x)track('cta_click',{id:id})},true);
var VM=new WeakMap();function vt(e){var v=e.target;if(!v||v.tagName!='VIDEO'||!v.hasAttribute('data-track-video'))return;var m=VM.get(v)||{},id=v.getAttribute('data-track-video')||'';VM.set(v,m);
function hit(n){if(!m[n]){m[n]=1;track('video_'+n,{id:id})}}
if(e.type=='play')hit('play');else if(e.type=='ended')hit(100);else if(v.duration){var f=v.currentTime/v.duration;if(f>=.25)hit(25);if(f>=.5)hit(50);if(f>=.98)hit(100)}}
['play','timeupdate','ended'].forEach(function(n){d.addEventListener(n,vt,true)});
if(C.px){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(w,d,'script','https://connect.facebook.net/en_US/fbevents.js');w.fbq('init',C.px)}
function px(n,data,eid){if(C.px&&w.fbq)w.fbq('track',n,data||{},eid?{eventID:eid}:{})}
var pv='pv.'+rid();px('PageView',{},pv);track('page_view',{event_id:pv});
w.groove={visitorId:vid,sessionId:sid,attribution:attribution,track:track,pixel:px,flush:flush};`;

export function trackerScript(opts: TrackerOptions): string {
  const cfg = { e: opts.endpoint, t: opts.client, p: opts.page, px: opts.pixelId ?? "" };
  return `(function(w,d,C){${BODY}})(window,document,${scriptSafeJson(cfg)});`;
}
