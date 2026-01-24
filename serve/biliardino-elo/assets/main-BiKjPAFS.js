import"./modulepreload-polyfill-B5Qt9EMX.js";import{g as et,a as q,B as k,b as I,f as at,c as B}from"./match.service-8YMje7wm.js";import{g as z}from"./get-display-elo.util-CFHiuv7v.js";class i{static LIVE_WINDOWS=[{start:660,end:675},{start:780,end:840},{start:960,end:975},{start:1080,end:1200}];static isLiveNow(o=new Date){const n=o.getHours()*60+o.getMinutes();return i.LIVE_WINDOWS.some(a=>n>=a.start&&n<a.end)}static sortKey="elo";static sortAsc=!1;static sortKeys=[null,"name","elo",null,"matches",null,"winrate","goaldiff","form"];static async init(){i.render(),i.makeHeadersSortable(),await i.renderLiveMatch()}static render(){const a=[...et().filter(r=>r.matches>0)],e=i.getTodayEloDeltas(),{sortKey:s,sortAsc:c}=i;a.sort((r,l)=>{let t=0;switch(s){case"rank":t=l.elo-r.elo;break;case"name":t=r.name.localeCompare(l.name);break;case"elo":t=l.elo-r.elo;break;case"matches":t=l.matches-r.matches;break;case"winrate":{const d=r.matches>0?(r.wins||0)/r.matches:0;t=(l.matches>0?(l.wins||0)/l.matches:0)-d;break}case"goaldiff":{const d=(r.goalsAgainst||0)>0?(r.goalsFor||0)/r.goalsAgainst:(r.goalsFor||0)>0?1/0:0;t=((l.goalsAgainst||0)>0?(l.goalsFor||0)/l.goalsAgainst:(l.goalsFor||0)>0?1/0:0)-d;break}case"form":{const d=(r.matchesDelta||[]).slice(-5).reduce((m,v)=>m+v,0);t=(l.matchesDelta||[]).slice(-5).reduce((m,v)=>m+v,0)-d;break}}return c?-t:t}),i.renderrRows(a,e),i.renderMatchStats(),i.renderRecentMatches()}static getTodayEloDeltas(){const o=new Date;o.setHours(0,0,0,0);const n=new Map,a=(e,s)=>{if(!Number.isFinite(s))return;const c=n.get(e)??{delta:0,matches:0};c.delta+=s,c.matches+=1,n.set(e,c)};for(const e of q()){const s=new Date(e.createdAt);s.setHours(0,0,0,0),s.getTime()===o.getTime()&&(a(e.teamA.defence,e.deltaELO[0]),a(e.teamA.attack,e.deltaELO[0]),a(e.teamB.defence,e.deltaELO[1]),a(e.teamB.attack,e.deltaELO[1]))}return n}static renderTodayDeltaBadge(o,n){const a=Math.round(o),e="margin-left:6px;font-size:0.85em;";return n===0?"":a>0?`<span class="today-delta positive" title="Oggi: +${a} Elo in ${n} partite" style="${e}color:green;">▲ +${a}</span>`:a<0?`<span class="today-delta negative" title="Oggi: ${a} Elo in ${n} partite" style="${e}color:#dc3545;">▼ ${a}</span>`:`<span class="today-delta neutral" title="Oggi: nessuna variazione in ${n} partite" style="${e}color:#a0aec0;">=</span>`}static buildRankMap(o,n){const a=o.toSorted((r,l)=>n(l)-n(r)),e=new Map;let s=1,c=null;for(let r=0;r<a.length;r++){const l=a[r],t=n(l);c!==null&&t===c||(s=r+1),e.set(l.id,s),c=t}return e}static renderTodayRankBadge(o,n){const a="margin-left:6px;font-size:0.85em;",e=Math.round(o);return e>0?`<span class="today-rank positive" title="Oggi: +${e} posizioni" style="${a}color:green;">▲ +${e}</span>`:e<0?`<span class="today-rank negative" title="Oggi: ${e} posizioni" style="${a}color:#dc3545;">▼ ${e}</span>`:n===0?"":`<span class="today-rank neutral" title="Oggi: nessuna variazione di posizione" style="${a}color:#a0aec0;">=</span>`}static makeHeadersSortable(){const n=i.getTable().querySelector("thead");if(!n)return;n.querySelectorAll("th").forEach((e,s)=>{i.sortKeys[s]&&(e.style.cursor="pointer",e.addEventListener("click",()=>{i.sortKey===i.sortKeys[s]?i.sortAsc=!i.sortAsc:(i.sortKey=i.sortKeys[s],i.sortAsc=!1),i.render(),i.updateSortIndicators()}))}),i.updateSortIndicators()}static updateSortIndicators(){const n=i.getTable().querySelector("thead");if(!n)return;const a=n.querySelectorAll("th"),e=i.sortKeys.map(s=>i.sortKey===s?i.sortAsc?" ↑":" ↓":"");a.forEach((s,c)=>{if(!i.sortKeys[c])return;const r=s.getAttribute("title"),l=s.textContent.replaceAll(/[↑↓]/g,"").trim();s.innerHTML=l+(e[c]||""),r&&s.setAttribute("title",r)})}static renderrRows(o,n){const e=i.getTable().querySelector("tbody"),s=document.createDocumentFragment(),c=i.buildRankMap(o,l=>z(l)),r=i.buildRankMap(o,l=>Math.round(l.elo-(n.get(l.id)?.delta??0)));for(let l=0;l<o.length;l++){const t=o[l],d=c.get(t.id)??l+1,p=z(t);let m=1,v=d,u=0;for(let y=l-1;y>=0&&z(o[y])===p;y--)u++;u>0&&(v=d,m+=u);for(let y=l+1;y<o.length&&z(o[y])===p;y++)m++;let P="";m>1?P=`${v}-${v+m-1}`:P=`${d}`;const x=d===1,j=d===2,A=d===3;let D="",b=t.defence*100,T="🛡️",E="#0077cc";b===50&&(T="⚖️",E="#6c757d"),b<50&&(b=100-b,T="⚔️",E="#dc3545"),D=`<span style="font-size:0.9em;color:${E};">${T} ${b}%</span>`;const C=(t.matchesDelta||[]).slice(-5);let $=0;C.forEach(y=>{$+=y});const S=C.slice().reverse().map(y=>y>0?"🟢":"🔴").join(""),w=$>=0?`<span style="font-size:0.85em;color:green;">(+${Math.round($)})</span>`:`<span style="font-size:0.85em;color:red;">(${Math.round($)})</span>`,L=t.wins||0,G=t.matches-L,R=t.matches>0?Math.round(L/t.matches*100):0,J=`${L} / ${G}`,H=t.goalsFor||0,N=t.goalsAgainst||0,g=N>0?H/N:H>0?1/0:0;let h="-";g===1/0?h='<span style="color:green;">∞</span>':g>0&&(h=`<span style="color:${g<.8?"red":g>1.2?"green":"inherit"};">${g.toFixed(2)}</span>`);const M=document.createElement("tr");M.style.cursor="pointer",d===1?M.style.backgroundColor="rgba(255, 215, 0, 0.15)":d===2?M.style.backgroundColor="rgba(192, 192, 192, 0.15)":d===3&&(M.style.backgroundColor="rgba(205, 127, 50, 0.15)"),d===3&&M.classList.add("podium-last"),M.addEventListener("click",()=>{globalThis.location.href=`./players.html?id=${t.id}`});const U=x||j||A?`<span style="font-weight: 700;">${t.name}</span>`:t.name,K=`
        <div class="player-avatar">
          <img 
            src="${k}avatars/${t.id}.webp" 
            alt="${t.name}"
            class="avatar-img"
            onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4='"
          />
        </div>
      `,W=n.get(t.id),Q=W?.delta??0,F=W?.matches??0,X=i.renderTodayDeltaBadge(Q,F),f=(r.get(t.id)??d)-d,Y=i.renderTodayRankBadge(f,F);M.innerHTML=`
        <td title="Posizione in classifica"><strong>${P}°</strong> ${Y}</td>
        <td title="Nome giocatore"><div class="player-info">${K}<span>${U}</span></div></td>
        <td title="ELO rating attuale"><strong>${p}</strong> ${X}</td>
        <td title="Ruolo preferito e percentuale">${D}</td>
        <td title="Partite giocate">${t.matches}</td>
        <td title="Vittorie - Sconfitte">${J}</td>
        <td title="Percentuale di vittorie">${R}%</td>
        <td title="Rapporto goal fatti/subiti">${h}</td>
        <td title="Ultime 5 partite e variazione ELO">${S||"-"} ${S?w:""}</td>
      `,s.appendChild(M)}e.innerHTML="",e.appendChild(s)}static renderMatchStats(){const o=q(),n=o.length,a=et(),e=o.reduce((p,m)=>p+m.score[0]+m.score[1],0);let s=null,c=0;for(const p of a){const m=p.bestElo;m>c&&(c=m,s=p)}let r={player1:"",player2:"",delta:-1/0};for(const p of a)if(p.teammatesDelta){for(const[m,v]of p.teammatesDelta)if(v>r.delta){const u=I(m);u&&(r={player1:p.name,player2:u.name,delta:v})}}let l={player1:"",player2:"",delta:1/0};for(const p of a)if(p.teammatesDelta){for(const[m,v]of p.teammatesDelta)if(v<l.delta){const u=I(m);u&&(l={player1:p.name,player2:u.name,delta:v})}}const t=document.createElement("div");if(t.className="match-stats-dashboard",t.innerHTML=`
      <div class="stat-card card-primary">
        <div class="stat-icon">⚽</div>
        <div class="stat-content">
          <div class="stat-label">Partite & Goal</div>
          <div class="stat-values-group">
            <div class="stat-value-row">
              <span class="stat-number">${n}</span>
              <span class="stat-unit">partite</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-value-row">
              <span class="stat-number">${e}</span>
              <span class="stat-unit">goal</span>
            </div>
          </div>
        </div>
      </div>
      <div class="stat-card card-warning">
        <div class="stat-icon">⭐</div>
        <div class="stat-content">
          <div class="stat-label">Max ELO Raggiunto</div>
          <div class="stat-value-group">
            <div class="stat-player-name">${s?s.name:"-"}</div>
            ${s?`<div class="delta-badge primary" style="margin-top: 0.5rem;">${Math.round(c)}</div>`:""}
          </div>
        </div>
      </div>
      <div class="stat-card card-success">
        <div class="stat-icon">🏆</div>
        <div class="stat-content">
          <div class="stat-label">Miglior Coppia</div>
          <div class="stat-value-group">
            ${r.delta===-1/0?'<div class="stat-empty">-</div>':`
              <div class="stat-pair-names">
                <div>${r.player1}</div>
                <div class="pair-separator">+</div>
                <div>${r.player2}</div>
              </div>
              <div class="delta-badge positive" style="margin-top: 0.5rem;">+${Math.round(r.delta)}</div>
            `}
          </div>
        </div>
      </div>
      <div class="stat-card card-danger">
        <div class="stat-icon">📉</div>
        <div class="stat-content">
          <div class="stat-label">Peggior Coppia</div>
          <div class="stat-value-group">
            ${l.delta===1/0?'<div class="stat-empty">-</div>':`
              <div class="stat-pair-names">
                <div>${l.player1}</div>
                <div class="pair-separator">+</div>
                <div>${l.player2}</div>
              </div>
              <div class="delta-badge negative" style="margin-top: 0.5rem;">${Math.round(l.delta)}</div>
            `}
          </div>
        </div>
      </div>
    `,document.querySelector(".tables-container")){const p=document.querySelector(".match-stats-dashboard");p?p.replaceWith(t):i.getTable().parentElement?.insertAdjacentElement("afterend",t)}}static getTable(){const o=document.getElementById("ranking");if(!o)throw new Error("Wrong ranking table id");return o}static renderRecentMatches(){const n=q().toSorted((t,d)=>d.createdAt-t.createdAt);if(!n.length)return;const a=document.querySelector(".tables-container");if(!a)return;const e=document.getElementById("recent-matches-wrapper");e&&e.remove();const s=document.createElement("div");s.id="recent-matches-wrapper",s.className="table-wrapper",s.style.marginTop="2.5rem";const c=document.createElement("table");c.id="recent-matches-table",c.innerHTML=`
      <caption style="caption-side:top;font-weight:700;font-size:1.2rem;margin-bottom:0.5rem;text-align:left;color:#2d3748;">Ultime partite giocate</caption>
      <thead>
        <tr>
          <th style="width:16px;"></th>
          <th>Rating</th>
          <th></th>
          <th>Team A</th>
          <th>Risultato</th>
          <th>Team B</th>
          <th></th>
        </tr>
      </thead>
      <tbody></tbody>
    `;const r=c.querySelector("tbody"),l=new Date;l.setHours(0,0,0,0);for(const t of n){let d=function(_,tt){return!_||tt===void 0?"?":`${_.name} <strong>(${Math.round(tt)})</strong>`};const p=new Date(t.createdAt);p.setHours(0,0,0,0);const m=p.getTime()===l.getTime(),v=I(t.teamA.attack),u=I(t.teamA.defence),P=I(t.teamB.attack),x=I(t.teamB.defence),j=t.teamAELO,A=t.teamBELO;let D=`${d(u,j[0])} & ${d(v,j[1])}`,b=`${d(x,A[0])} & ${d(P,A[1])}`;const T=t.score[0]>t.score[1];let E=Math.round(t.teamELO[0]),Z=Math.round(t.teamELO[1]),C=Math.round(t.deltaELO[0]),$=Math.round(t.deltaELO[1]),S=t.expectedScore[0],w=t.expectedScore[1],L=t.score[0],G=t.score[1];T||([D,b]=[b,D],[E,Z]=[Z,E],[C,$]=[$,C],[S,w]=[w,S],[L,G]=[G,L]);const R=C>=0?"green":"red",J=$>=0?"green":"red",H=`<span style="font-size:0.85em;color:${R};">(${C>=0?"+":""}${C})</span>`,N=`<span style="font-size:0.85em;color:${J};">(${$>=0?"+":""}${$})</span>`,g=typeof S=="number"?Math.round(S*100):"?",h=typeof w=="number"?Math.round(w*100):"?",M=g==="?"?"inherit":g>50?"green":g<50?"red":"inherit",U=h==="?"?"inherit":h>50?"green":h<50?"red":"inherit",V=g!=="?"&&(g>=60||g<=40),K=h!=="?"&&(h>=60||h<=40),W=V?`<strong>(${g}%)</strong>`:`(${g}%)`,Q=K?`<strong>(${h}%)</strong>`:`(${h}%)`,F=`${L} - ${G}`,X=`<span style="font-size:0.85em;color:${M};">${W}</span> <strong>${F}</strong> <span style="font-size:0.85em;color:${U};">${Q}</span>`,O=(E+Z)/2;let f="";O>=1080?f="background-color: rgba(0, 0, 255, 0.25);":O>=1040?f="background-color: rgba(0, 127, 255, 0.1);":O<=900?f="background-color: rgba(255, 0, 0, 0.2);":O<=950&&(f="background-color: rgba(255, 127, 0, 0.1);");const Y=document.createElement("tr"),y=m?'<span title="Partita di oggi" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 40% 40%, #4fc3f7 70%, #1976d2 100%);box-shadow:0 0 4px #1976d2aa;vertical-align:middle;margin:0 2px;"></span>':"";Y.innerHTML=`
        <td style="${f}text-align:center;">${y}</td>
        <td style="${f}font-size:1.15em;font-style:italic;"><strong>${Math.round(O)}</strong></td>
        <td style="${f}"><strong>${E}</strong> ${H}</td>
        <td style="${f}">${D}</td>
        <td style="${f}">${X}</td>
        <td style="${f}">${b}</td>
        <td style="${f}"><strong>${Z}</strong> ${N}</td>
      `,r.appendChild(Y)}s.appendChild(c),a.appendChild(s)}static async renderLiveMatch(){const o=document.getElementById("live-match-container");if(o)try{const n=await at();if(!n){o.innerHTML="";return}const a=I(n.teamA.defence),e=I(n.teamA.attack),s=I(n.teamB.defence),c=I(n.teamB.attack);if(!a||!e||!s||!c){o.innerHTML="";return}const r=Math.round((B(a,!0)+B(e,!1))/2),l=Math.round((B(s,!0)+B(c,!1))/2),t=Math.round(a.defence*100),d=100-Math.round(e.defence*100),p=Math.round(s.defence*100),m=100-Math.round(c.defence*100),v=1/(1+Math.pow(10,(l-r)/400)),u=1-v,P=(v*100).toFixed(1),x=(u*100).toFixed(1),j=b=>{const T=Number.parseFloat(b);return T<50?"winprob-low":T>50?"winprob-high":"winprob-neutral"},A="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4=",D=i.isLiveNow();o.innerHTML=`
        <div class="live-match-panel">
          <div class="live-match-header">
            ${D?'<span class="live-badge">LIVE</span>':""}
            <span class="live-title">${D?"Partita in Corso":"Prossima Partita"}</span>
          </div>
          <div class="live-match-content">
            <div class="live-team">
              <div class="live-team-winprob ${j(P)}">
                <span class="winprob-value">${P}%</span>
                <span class="team-elo-label">team elo</span>
                <span class="team-elo-value">${r}</span>
              </div>
              <div class="live-players">
                <div class="live-player">
                  <img src="${k}avatars/${a.id}.webp" alt="${a.name}" class="live-avatar" onerror="this.src='${A}'" />
                  <div class="live-player-info">
                    <span class="live-player-name">🛡️ ${a.name}</span>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      <span class="role-badge badge-def">DIF ${t}%</span>
                      <span class="live-player-elo">${Math.round(B(a,!0))} <span style="font-size:0.85em;opacity:0.7;">(${z(a)})</span></span>
                    </div>
                  </div>
                </div>
                <div class="live-player">
                  <img src="${k}avatars/${e.id}.webp" alt="${e.name}" class="live-avatar" onerror="this.src='${A}'" />
                  <div class="live-player-info">
                    <span class="live-player-name">⚔️ ${e.name}</span>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      <span class="role-badge badge-att">ATT ${d}%</span>
                      <span class="live-player-elo">${Math.round(B(e,!1))} <span style="font-size:0.85em;opacity:0.7;">(${z(e)})</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="live-vs">VS</div>
            <div class="live-team">
              <div class="live-team-winprob ${j(x)}">
                <span class="winprob-value">${x}%</span>
                <span class="team-elo-label">team elo</span>
                <span class="team-elo-value">${l}</span>
              </div>
              <div class="live-players">
                <div class="live-player">
                  <img src="${k}avatars/${s.id}.webp" alt="${s.name}" class="live-avatar" onerror="this.src='${A}'" />
                  <div class="live-player-info">
                    <span class="live-player-name">🛡️ ${s.name}</span>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      <span class="role-badge badge-def">DIF ${p}%</span>
                      <span class="live-player-elo">${Math.round(B(s,!0))} <span style="font-size:0.85em;opacity:0.7;">(${z(s)})</span></span>
                    </div>
                  </div>
                </div>
                <div class="live-player">
                  <img src="${k}avatars/${c.id}.webp" alt="${c.name}" class="live-avatar" onerror="this.src='${A}'" />
                  <div class="live-player-info">
                    <span class="live-player-name">⚔️ ${c.name}</span>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      <span class="role-badge badge-att">ATT ${m}%</span>
                      <span class="live-player-elo">${Math.round(B(c,!1))} <span style="font-size:0.85em;opacity:0.7;">(${z(c)})</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `}catch(n){console.error("Failed to render live match",n),o.innerHTML=""}}}i.init();
