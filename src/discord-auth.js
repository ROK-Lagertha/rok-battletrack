// CF-012: independent Discord OAuth2 access check. No legacy admin privilege is granted.
const CLIENT_ID = '1557797621832360027';
const GUILD_ID = '1462581217722368074';
const REQUIRED = ['1462837066227519663', '1462838058947973304'];
const CALLBACK = 'https://rok-battletrack.jici1203.workers.dev/api/auth/discord/callback';
const SCOPES = 'identify guilds.members.read';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const COOKIE = '__Host-bt_discord';
const STATE = '__Host-bt_oauth_state';
const json = (obj, status=200) => new Response(JSON.stringify(obj), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const redirect = (path, headers={}) => new Response(null,{status:302,headers:{location:path,'cache-control':'no-store',...headers}});
const cookie = (name,value,maxAge) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const clear = name => cookie(name,'',0);
const bytesTo64 = b => btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64 = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)), c=>c.charCodeAt(0));
const random = () => bytesTo64(crypto.getRandomValues(new Uint8Array(32)));
function getCookie(req,name){const match=(req.headers.get('cookie')||'').match(new RegExp('(?:^|;\\s*)'+name+'=([^;]*)'));return match?.[1]||'';}
async function key(env){if(!env.SESSION_SECRET||!env.DISCORD_CLIENT_SECRET)throw new Error('Discord auth secrets missing');const hash=await crypto.subtle.digest('SHA-256',encoder.encode(env.SESSION_SECRET));return crypto.subtle.importKey('raw',hash,'AES-GCM',false,['encrypt','decrypt']);}
async function seal(env,data){const iv=crypto.getRandomValues(new Uint8Array(12));const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),encoder.encode(JSON.stringify(data))));return bytesTo64(iv)+'.'+bytesTo64(ct);}
async function unseal(env,value){try{const [a,b]=value.split('.');if(!a||!b)return null;const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(a)},await key(env),from64(b));return JSON.parse(decoder.decode(raw));}catch{return null;}}
function errorPage(msg){return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>BattleTrack Login</title><body style="background:#101423;color:#eee;font:16px system-ui;max-width:560px;margin:12vh auto;padding:24px"><h1>BattleTrack · Discord Access</h1><p>${msg}</p><a style="color:#a5a6ff" href="/">Back to BattleTrack</a></body></html>`,{status:403,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'"}});}
async function discordGet(path,token){const r=await fetch('https://discord.com/api/v10'+path,{headers:{authorization:'Bearer '+token,accept:'application/json'}});if(!r.ok)return null;return r.json();}
async function memberCheck(token){const [user,member]=await Promise.all([discordGet('/users/@me',token),discordGet(`/users/@me/guilds/${GUILD_ID}/member`,token)]);if(!user?.id||!Array.isArray(member?.roles))return null;return {user,roles:member.roles,allowed:REQUIRED.every(role=>member.roles.includes(role))};}
export async function discordAuth(request,env,path){
  if(request.method!=='GET'&&path!=='/api/auth/discord/logout')return json({ok:false,error:'Method not allowed'},405);
  if(path==='/api/auth/discord/login'){
    const nonce=random();const state=await seal(env,{nonce,exp:Date.now()+10*60*1000});
    const params=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:CALLBACK,scope:SCOPES,state:nonce,prompt:'consent'});
    return redirect('https://discord.com/oauth2/authorize?'+params,{'set-cookie':cookie(STATE,state,600)});
  }
  if(path==='/api/auth/discord/callback'){
    const url=new URL(request.url);const state=await unseal(env,getCookie(request,STATE));
    if(!state||state.exp<Date.now()||!url.searchParams.get('state')||state.nonce!==url.searchParams.get('state'))return errorPage('Login request expired or invalid. Please start again.');
    const code=url.searchParams.get('code');if(!code)return errorPage('Discord authorization was cancelled.');
    const params=new URLSearchParams({client_id:CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:CALLBACK});
    const r=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params});
    if(!r.ok)return errorPage('Discord could not complete authorization. Please retry.');
    const tokens=await r.json();if(!tokens.access_token)return errorPage('Discord did not return an access token.');
    const member=await memberCheck(tokens.access_token);
    if(!member?.allowed)return new Response(errorPage('Access denied. Membership and BOTH Officer + Data roles are required.').body,{status:403,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','set-cookie':clear(STATE)}});
    const expires=Math.min(Date.now()+60*60*1000,Date.now()+Math.max(0,(tokens.expires_in||3600)-60)*1000);
    const session=await seal(env,{token:tokens.access_token,userId:member.user.id,exp:expires});
    const headers=new Headers({location:'/?discord_auth=success','cache-control':'no-store'});
    headers.append('set-cookie',cookie(COOKIE,session,3600));headers.append('set-cookie',clear(STATE));
    return new Response(null,{status:302,headers});
  }
  if(path==='/api/auth/discord/logout')return new Response(null,{status:204,headers:{'set-cookie':clear(COOKIE),'cache-control':'no-store'}});
  if(path==='/api/auth/discord/me'){
    const session=await unseal(env,getCookie(request,COOKIE));if(!session||session.exp<Date.now())return json({ok:false,authenticated:false},401);
    const member=await memberCheck(session.token);if(!member?.allowed||member.user.id!==session.userId)return json({ok:false,authenticated:false,reason:'roles_or_membership'},403);
    return json({ok:true,authenticated:true,user:{id:member.user.id,username:member.user.username,global_name:member.user.global_name},leadershipAccess:true});
  }
  return json({ok:false,error:'Not found'},404);
}
