import"./modulepreload-polyfill-B5Qt9EMX.js";import{b as A,a as it,g as lt,B as H,c as rt}from"./match.service-8YMje7wm.js";import{g as dt}from"./get-display-elo.util-CFHiuv7v.js";function pt(y){const t={history:[],elo:A(y).startElo,bestElo:-1/0,worstElo:1/0,matches:0,matchesAsAttack:0,matchesAsDefence:0,wins:0,winsAsAttack:0,winsAsDefence:0,losses:0,lossesAsAttack:0,lossesAsDefence:0,bestWinStreak:0,worstLossStreak:0,bestTeammateCount:null,bestTeammate:null,worstTeammate:null,bestOpponent:null,worstOpponent:null,bestVictoryByElo:null,worstDefeatByElo:null,bestVictoryByScore:null,worstDefeatByScore:null,totalGoalsFor:0,totalGoalsAgainst:0},d=it(),e={},l={};let r=0,v=-1/0,u=1/0,$=-1,h=-1;for(const o of d){const s=mt(y,o);if(s===-1)continue;const i=vt(y,s,o);b(s,o),t.history.push(o),x(i,o,s),M(o.deltaELO[s]),f(s,i,o),g(o,s),T(s,o)}return O(),t;function b(o,s){const i=o===0?s.deltaELO[0]:s.deltaELO[1];t.elo+=i,t.elo>t.bestElo&&(t.bestElo=t.elo),t.elo<t.worstElo&&(t.worstElo=t.elo)}function x(o,s,i){const a=o===0?"AsDefence":"AsAttack";t.matches++,t[`matches${a}`]++,s.deltaELO[i]>0?(t.wins++,t[`wins${a}`]++):(t.losses++,t[`losses${a}`]++)}function M(o){o>0?(r=Math.max(0,r)+1,r>t.bestWinStreak&&(t.bestWinStreak=r)):(r=Math.min(0,r)-1,-r>t.worstLossStreak&&(t.worstLossStreak=-r))}function f(o,s,i){const a=i.deltaELO[o],n=gt(o,s,i),{attack:c,defence:m}=ut(o,i);e[n]??=[0,0],e[n][0]++,e[n][1]+=a,l[c]??=0,l[c]+=a,l[m]??=0,l[m]+=a}function g(o,s){const i=o.deltaELO[s],a=i>0,n=o.score,c=Math.abs(n[0]-n[1]);a?(i>=v&&(t.bestVictoryByElo=o,v=i),c>=$&&(t.bestVictoryByScore=o,$=c)):(i<=u&&(t.worstDefeatByElo=o,u=i),c>=h&&(t.worstDefeatByScore=o,h=c))}function T(o,s){t.totalGoalsFor+=s.score[o],t.totalGoalsAgainst+=s.score[o^1]}function O(){let o=-1,s=-1/0,i=-1,a=1/0,n=-1,c=0;for(const p in e)e[p][1]>s&&(s=e[p][1],o=+p),e[p][1]<a&&(a=e[p][1],i=+p),e[p][0]>c&&(c=e[p][0],n=+p);t.bestTeammateCount={score:c,player:A(n)},t.bestTeammate={score:s,player:A(o)},t.worstTeammate={score:a,player:A(i)};let m=-1,I=1/0,w=-1,E=-1/0;for(const p in l)l[p]<I&&(I=l[p],m=+p),l[p]>E&&(E=l[p],w=+p);t.bestOpponent={score:I,player:A(m)},t.worstOpponent={score:E,player:A(w)}}}function mt(y,t){return t.teamA.defence===y||t.teamA.attack===y?0:t.teamB.defence===y||t.teamB.attack===y?1:-1}function vt(y,t,d){return t===0?+(d.teamA.attack===y):+(d.teamB.attack===y)}function gt(y,t,d){return d[y===0?"teamA":"teamB"][t===0?"attack":"defence"]}function ut(y,t){return t[y===0?"teamB":"teamA"]}class S{static init(){const t=new URLSearchParams(globalThis.location.search),d=Number.parseInt(t.get("id"));if(!d){S.renderError("Nessun giocatore specificato. Aggiungi ?id=PLAYER_ID all'URL.");return}const e=A(d);if(!e){S.renderError("Giocatore non trovato.");return}S.renderPlayerStats(e)}static renderError(t){const d=document.getElementById("player-stats");d&&(d.innerHTML=`<div class="empty-state">${t}</div>`)}static renderPlayerStats(t){const d=document.getElementById("player-stats");if(!d)throw new Error("Player stats container not found");const e=pt(t.id);if(!e){d.innerHTML='<div class="empty-state">Nessuna statistica disponibile</div>';return}const l=document.getElementById("player-name");if(l){const a=lt().filter(c=>c.matches>0).toSorted((c,m)=>m.elo-c.elo).findIndex(c=>c.id===t.id)+1,n=a>0?` (${a}°)`:"";l.textContent=`Statistiche di ${t.name}${n}`}const r=e.matches>0?(e.wins/e.matches*100).toFixed(0):"0",v=e.matchesAsAttack>0?(e.winsAsAttack/e.matchesAsAttack*100).toFixed(0):"0",u=e.matchesAsDefence>0?(e.winsAsDefence/e.matchesAsDefence*100).toFixed(0):"0",$=e.matches>0?(e.matchesAsAttack/e.matches*100).toFixed(0):"0",h=e.matches>0?(e.matchesAsDefence/e.matches*100).toFixed(0):"0",b=s=>Number.isFinite(s)?Math.round(s):"N/A",x=s=>s?`${s.player.name} (${s.score>0?"+":""}${s.score.toFixed(0)})`:"N/A",M=(s,i)=>{if(!s)return{score:"N/A",details:""};const a=s.teamA.attack===i||s.teamA.defence===i,n=a?`${s.score[0]}-${s.score[1]}`:`${s.score[1]}-${s.score[0]}`,c=a?s.teamA:s.teamB,m=a?s.teamB:s.teamA,I=A(c.attack===i?c.defence:c.attack),w=A(m.attack),E=A(m.defence),p=I?.name||"?",P=`${w?.name||"?"} & ${E?.name||"?"}`,k=a?s.deltaELO[0]:s.deltaELO[1];return{score:n,details:`<small>vs ${P}</small><br><small>con ${p} (${k>0?"+":""}${k.toFixed(0)} ELO)</small>`}},f=(s,i)=>{if(!s)return{score:"N/A",details:""};const a=s.teamA.attack===i||s.teamA.defence===i,n=a?s.score[0]:s.score[1],c=a?s.score[1]:s.score[0],m=n-c,I=a?s.teamA:s.teamB,w=a?s.teamB:s.teamA,E=A(I.attack===i?I.defence:I.attack),p=A(w.attack),P=A(w.defence),k=E?.name||"?",L=`${p?.name||"?"} & ${P?.name||"?"}`;return{score:`${n}-${c}`,details:`<small>vs ${L}</small><br><small>con ${k} (${m>0?"+":""}${m})</small>`}},g=(s,i)=>{const a=s.teamA.attack===t.id||s.teamA.defence===t.id,n=a?s.teamA:s.teamB,c=a?s.teamB:s.teamA,m=A(n.attack===t.id?n.defence:n.attack),I=A(c.defence),w=A(c.attack);function E(R,V){return!R||V===void 0?"?":`${R.name} <strong>(${Math.round(V)})</strong>`}const p=s.teamAELO||[void 0,void 0],P=s.teamBELO||[void 0,void 0];let k;a?k=n.defence===t.id?p[1]:p[0]:k=n.defence===t.id?P[1]:P[0];const L=E(m,k),W=a?P[0]:p[0],Y=a?P[1]:p[1],U=`${E(I,W)} & ${E(w,Y)}`,B=a?s.score[0]:s.score[1],j=a?s.score[1]:s.score[0],J=B>j,Q=n.attack===t.id?'<span style="font-size:0.9em;color:#dc3545;">⚔️ ATT</span>':'<span style="font-size:0.9em;color:#0077cc;">🛡️ DIF</span>',X=Math.round(a?s.teamELO[0]:s.teamELO[1]),K=Math.round(a?s.teamELO[1]:s.teamELO[0]),q=Math.round(a?s.deltaELO[0]:s.deltaELO[1]),G=Math.round(a?s.deltaELO[1]:s.deltaELO[0]),_=q>=0?"green":"red",tt=`<span style="color:${G>=0?"green":"red"};">(${G>=0?"+":""}${G})</span>`,F=a?s.expectedScore[0]:s.expectedScore[1],N=a?s.expectedScore[1]:s.expectedScore[0],C=typeof F=="number"?Math.round(F*100):"?",D=typeof N=="number"?Math.round(N*100):"?",st=C==="?"?"inherit":C>50?"green":C<50?"red":"inherit",et=D==="?"?"inherit":D>50?"green":D<50?"red":"inherit",Z={...t,elo:i},at=n.defence===t.id,nt=Math.round(rt(Z,at)),ot=Math.round(dt(Z)),z=a?s.deltaELO[0]:s.deltaELO[1],ct=`<span style="color:${_};">(${z>=0?"+":""}${Math.round(z)})</span>`;return`
        <tr class="${J?"match-win":"match-loss"}">
          <td><strong>${nt}</strong> <span style="font-size:0.85em;opacity:0.7;">(${ot})</span></td>
          <td><strong>${X}</strong> ${ct}</td>
          <td>${Q}</td>
          <td>${L}</td>
          <td><span style="color:${st};font-size:0.85em;">(${C}%)</span> <strong>${B}-${j}</strong> <span style="color:${et};font-size:0.85em;">(${D}%)</span></td>
          <td>${U}</td>
          <td><strong>${K}</strong> ${tt}</td>
        </tr>
      `};`${H}${t.id}`,`${t.name}`;const o=`
  <div class="pp-row">
    <div class="player-card pp-card">
      <div class="pp-avatar">
        <img
          src="${H}avatars/${t.id}.webp"
          alt="${t.name}"
          class="pp-avatar-img"
          onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJncmFkIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgeDE9IjAlIiB5MT0iMCUiIHgyPSIwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMGUwZTA7c3RvcC1vcGFjaXR5OjEiIC8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZjVmNWY1O3N0b3Atb3BhY2l0eToxIiAvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgZmlsbD0idXJsKCNncmFkKSIvPjxjaXJjbGUgY3g9IjI0IiBjeT0iMTUiIHI9IjciIGZpbGw9IiM3OTdhYjEiLz48cGF0aCBkPSJNIDEwIDMwIEMgMTAgMjQgMTYgMjAgMjQgMjAgQyAzMiAyMCAzOCAyNCAzOCAzMCBDIDM4IDM4IDMyIDQyIDI0IDQyIEMgMTYgNDIgMTAgMzggMTAgMzAiIGZpbGw9IiM3OTdhYjEiLz48L3N2Zz4='"
        />
      </div>

      <div class="pp-content">
        <div class="pp-header">
          <h2 class="pp-name">🎮 ${t.name}</h2>
          <span class="pp-win">Win ${r}%</span>
        </div>

        <div class="pp-stats">
          <div class="stat-item">
            <span class="stat-label">ELO Attuale</span>
            <span class="stat-value highlight">${b(e.elo)}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Miglior ELO</span>
            <span class="stat-value positive">${b(e.bestElo)}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Peggior ELO</span>
            <span class="stat-value negative">${b(e.worstElo)}</span>
          </div>

          <div class="stat-item">
            <span class="stat-label">Partite</span>
            <span class="stat-value">${e.matches}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
`;d.innerHTML=`
      ${o}

      <div class="player-card">
        <h2>⚽ Partite</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Partite Totali</span>
            <span class="stat-value">${e.matches}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Attaccante</span>
            <span class="stat-value">${e.matchesAsAttack} <span class="percentage">(${$}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Come Difensore</span>
            <span class="stat-value">${e.matchesAsDefence} <span class="percentage">(${h}%)</span></span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🏆 Vittorie e Sconfitte</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Generale</span>
            <span class="stat-value">${e.wins}V - ${e.losses}S <span class="percentage">(${r}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">⚔️ Attacco</span>
            <span class="stat-value">${e.winsAsAttack}V - ${e.lossesAsAttack}S <span class="percentage">(${v}%)</span></span>
          </div>
          <div class="stat-item">
            <span class="stat-label">🛡️ Difesa</span>
            <span class="stat-value">${e.winsAsDefence}V - ${e.lossesAsDefence}S <span class="percentage">(${u}%)</span></span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>🔥 Streak</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Migliore Striscia Vittorie</span>
            <span class="stat-value positive">${e.bestWinStreak}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Peggiore Striscia Sconfitte</span>
            <span class="stat-value negative">${e.worstLossStreak}</span>
          </div>
        </div>
      </div>

      <div class="player-card">
        <h2>⚽ Goal</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Goal Totali Fatti</span>
            <span class="stat-value positive">${e.totalGoalsFor}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Goal Totali Subiti</span>
            <span class="stat-value negative">${e.totalGoalsAgainst}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Rapporto Goal Fatti/Subiti</span>
            <span class="stat-value">${e.totalGoalsAgainst===0?"∞":(e.totalGoalsFor/e.totalGoalsAgainst).toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Fatti</span>
            <span class="stat-value">${(e.totalGoalsFor/e.matches).toFixed(2)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Media Goal Subiti</span>
            <span class="stat-value">${(e.totalGoalsAgainst/e.matches).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div class="player-card teammates-card">
        <h2>👥 Compagni e Avversari</h2>
        <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-label">Compagno Frequente</span>
              <span class="stat-value player-name">${e.bestTeammateCount?`${e.bestTeammateCount.player.name} (${e.bestTeammateCount.score})`:"N/A"}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Miglior Compagno</span>
              <span class="stat-value player-name positive">${x(e.bestTeammate)}</span>
            </div>
          <div class="stat-item">
            <span class="stat-label">Peggior Compagno</span>
            <span class="stat-value player-name negative">${x(e.worstTeammate)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Avversario Più Forte</span>
            <span class="stat-value player-name negative">${x(e.bestOpponent)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Avversario Più Scarso</span>
            <span class="stat-value player-name positive">${x(e.worstOpponent)}</span>
          </div>
        </div>
      </div>

      <div class="player-card best-worst-card">
        <h2>🏅 Migliori e Peggiori Partite</h2>
        <div class="best-worst-grid">
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (ELO)</span>
            <span class="stat-score positive">${(()=>{const s=M(e.bestVictoryByElo,t.id);return s.score==="N/A"?s.score:`<strong>${s.score}</strong>`})()}</span>
            <span class="stat-details">${M(e.bestVictoryByElo,t.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (ELO)</span>
            <span class="stat-score negative">${(()=>{const s=M(e.worstDefeatByElo,t.id);return s.score==="N/A"?s.score:`<strong>${s.score}</strong>`})()}</span>
            <span class="stat-details">${M(e.worstDefeatByElo,t.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Migliore Vittoria (Punteggio)</span>
            <span class="stat-score positive">${(()=>{const s=f(e.bestVictoryByScore,t.id);return s.score==="N/A"?s.score:`<strong>${s.score}</strong>`})()}</span>
            <span class="stat-details">${f(e.bestVictoryByScore,t.id).details}</span>
          </div>
          <div class="best-worst-item">
            <span class="stat-label">Peggiore Sconfitta (Punteggio)</span>
            <span class="stat-score negative">${(()=>{const s=f(e.worstDefeatByScore,t.id);return s.score==="N/A"?s.score:`<strong>${s.score}</strong>`})()}</span>
            <span class="stat-details">${f(e.worstDefeatByScore,t.id).details}</span>
          </div>
        </div>
      </div>

      <div class="player-card chart-card">
        <h2>📈 Andamento ELO</h2>
        <div class="chart-wrapper" id="elo-chart"></div>
      </div>

      <div class="player-card history-card">
        <h2>📜 Storico Partite</h2>
        <div class="match-history">
          ${e.history.length===0?'<p class="empty-state">Nessuna partita giocata</p>':`
            <table class="match-history-table">
              <thead>
                <tr>
                  <th>Elo</th>
                  <th>Elo Team</th>
                  <th>Ruolo</th>
                  <th>Compagno</th>
                  <th>Risultato</th>
                  <th>Avversari</th>
                  <th>Elo Avversari</th>
                </tr>
              </thead>
              <tbody>
                ${(()=>{const s=t.startElo,i=[s];let a=s;for(const n of e.history){const m=n.teamA.attack===t.id||n.teamA.defence===t.id?n.deltaELO[0]:n.deltaELO[1];a+=m,i.push(a)}return e.history.slice().reverse().map((n,c)=>{const m=i[e.history.length-c-1];return g(n,m)}).join("")})()}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `,S.renderEloChart(e,t)}static renderEloChart(t,d){const e=document.getElementById("elo-chart");if(!e)return;const l=S.buildEloProgression(t.history,d.startElo,d.id);if(l.length===0){e.innerHTML=`<p class="empty-state">Nessuna partita per calcolare l'andamento ELO.</p>`;return}const r=l.map(n=>n.value),v=Math.min(...r),u=Math.max(...r),$=S.getYStep(u-v),h=Math.floor(v/$)*$,b=Math.ceil(u/$)*$,x=Math.max(b-h,1),M=Math.min(Math.max(l.length*55,600),1200),f=260,g=40,T=l.map((n,c)=>{const m=g+c/Math.max(l.length-1,1)*(M-g*2),I=f-g-(n.value-h)/x*(f-g*2);return{...n,x:m,y:I}}),O=S.createSmoothPath(T),o=`${O} L ${T.at(-1)?.x??g} ${f-g} L ${T[0]?.x??g} ${f-g} Z`,s=Math.max(1,Math.ceil(l.length/8)),i=T.map((n,c)=>c%s!==0&&c!==T.length-1?"":`<text x="${n.x}" y="${f-g+18}" class="chart-label" text-anchor="middle">${n.label}</text>`).join(""),a=T.map((n,c)=>{const m=Math.round(n.value);return`<circle cx="${n.x}" cy="${n.y}" r="3" class="chart-point" data-elo="${m}">
        <title>ELO: ${m}</title>
      </circle>`}).join("");e.innerHTML=`
      <div class="chart-meta">
        <span>Min: ${Math.round(v)}</span>
        <span>Max: ${Math.round(u)}</span>
        <span>Ultimo: ${Math.round(r[r.length-1])}</span>
      </div>
      <svg viewBox="0 0 ${M} ${f}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Andamento ELO nel tempo">
        <defs>
          <linearGradient id="eloGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4a5568" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#2d3748" stop-opacity="0.05" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#4a5568" />
            <stop offset="100%" stop-color="#2d3748" />
          </linearGradient>
        </defs>
        ${S.renderYTicks(h,b,$,f,g,M)}
        <path d="${o}" class="chart-area" />
        <path d="${O}" class="chart-line" />
        ${a}
        ${i}
        <line x1="${g}" y1="${f-g}" x2="${M-g}" y2="${f-g}" class="chart-axis" />
        <line x1="${g}" y1="${g}" x2="${g}" y2="${f-g}" class="chart-axis" />
      </svg>
    `}static renderYTicks(t,d,e,l,r,v){const u=[];for(let $=d;$>=t;$-=e){const h=($-t)/Math.max(d-t,1),b=r+(1-h)*(l-r*2);u.push(`
        <line x1="${r}" y1="${b}" x2="${v-r}" y2="${b}" class="chart-grid" />
        <text x="${r-10}" y="${b+4}" text-anchor="end" class="chart-tick">${$}</text>
      `)}return u.join("")}static getYStep(t){return t<=150?25:t<=300?50:t<=600?100:t<=1e3?150:200}static buildEloProgression(t,d,e){if(t.length===0)return[];const l=[{value:d,label:"0"}];let r=d;for(let v=0;v<t.length;v++){const u=t[v],h=e===u.teamA.attack||e===u.teamA.defence?u.deltaELO[0]:u.deltaELO[1];r+=h,l.push({value:r,label:`${v+1}`})}return l}static createSmoothPath(t){if(t.length===0)return"";if(t.length===1)return`M ${t[0].x.toFixed(2)} ${t[0].y.toFixed(2)}`;if(t.length===2)return`M ${t[0].x.toFixed(2)} ${t[0].y.toFixed(2)} L ${t[1].x.toFixed(2)} ${t[1].y.toFixed(2)}`;let d=`M ${t[0].x.toFixed(2)} ${t[0].y.toFixed(2)}`;const e=.3;for(let l=0;l<t.length-1;l++){const r=t[l],v=t[l+1],u=l>0?t[l-1]:r,$=l<t.length-2?t[l+2]:v,h=r.x+(v.x-u.x)*e,b=r.y+(v.y-u.y)*e,x=v.x-($.x-r.x)*e,M=v.y-($.y-r.y)*e;d+=` C ${h.toFixed(2)} ${b.toFixed(2)}, ${x.toFixed(2)} ${M.toFixed(2)}, ${v.x.toFixed(2)} ${v.y.toFixed(2)}`}return d}}S.init();
