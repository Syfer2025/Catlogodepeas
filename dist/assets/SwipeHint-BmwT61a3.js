import{r as n,j as t}from"./vendor-react-CeZ-fTZM.js";import{C as m}from"./chevron-up-DQYwLTu3.js";import{a_ as u}from"./index-BBrD0Nu8.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=[["path",{d:"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2",key:"1fvzgz"}],["path",{d:"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2",key:"1kc0my"}],["path",{d:"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8",key:"10h0bg"}],["path",{d:"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",key:"1s1gnw"}]],p=u("hand",l);var i=3e3,c=!1;function x(){if(!(c||typeof document>"u")){c=!0;var e=document.createElement("style");e.textContent=`
@keyframes swipeHandMove {
  0% { transform: translateY(0); }
  35% { transform: translateY(-32px); }
  55% { transform: translateY(-32px); }
  80% { transform: translateY(0); }
  100% { transform: translateY(0); }
}
@keyframes swipeHintFadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes swipeHintFadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
  `,document.head.appendChild(e)}}function y({visible:e}){var[s,r]=n.useState(!0),[d,o]=n.useState(!1);return n.useEffect(function(){x()},[]),n.useEffect(function(){if(e){var a=setTimeout(function(){o(!0)},i-500),f=setTimeout(function(){r(!1)},i);return function(){clearTimeout(a),clearTimeout(f)}}},[e]),n.useEffect(function(){if(!e||!s)return;function a(){o(!0),setTimeout(function(){r(!1)},300)}return window.addEventListener("touchstart",a,{once:!0,passive:!0}),window.addEventListener("mousedown",a,{once:!0}),function(){window.removeEventListener("touchstart",a),window.removeEventListener("mousedown",a)}},[e,s]),!e||!s?null:t.jsxs("div",{className:"absolute inset-0 z-30 flex items-center justify-center pointer-events-none",style:{animation:d?"swipeHintFadeOut 0.4s ease-out forwards":"swipeHintFadeIn 0.3s ease-out"},children:[t.jsx("div",{className:"absolute inset-0 bg-black/30 rounded-lg"}),t.jsxs("div",{className:"relative flex flex-col items-center gap-2",children:[t.jsxs("div",{style:{animation:"swipeHandMove 1.4s ease-in-out infinite"},className:"flex flex-col items-center",children:[t.jsx(m,{className:"w-8 h-8 text-white drop-shadow-lg",strokeWidth:2.5}),t.jsx(p,{className:"w-11 h-11 text-white drop-shadow-xl mt-0.5",strokeWidth:1.8,style:{filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.4))"}})]}),t.jsx("p",{className:"text-white text-center mt-1",style:{fontSize:"0.85rem",fontWeight:600,textShadow:"0 2px 8px rgba(0,0,0,0.7)",letterSpacing:"0.02em"},children:"Deslize para cima"}),t.jsx("p",{className:"text-white/70 text-center",style:{fontSize:"0.7rem",fontWeight:500,textShadow:"0 1px 4px rgba(0,0,0,0.5)"},children:"para o próximo vídeo"})]})]})}export{y as S};
