import React, { useState, useRef } from "react";
import { Camera, Upload, Loader2, Check, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   ROBOT AVATAR SYSTEM
   - 16 unique robot SVG avatars with different personalities
   - Each has a unique background gradient color
   - Users can pick one OR upload a custom image
   ═══════════════════════════════════════════════════════════════ */

export interface AvatarDef {
  id: string;
  label: string;
  bg: string;
  bgStyle?: React.CSSProperties;
  svg: React.ReactNode;
}

/* ─── Robot SVG components (all 56x56 viewBox) ─── */

function Robot1() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="16" y="18" width="24" height="20" rx="5" fill="white" opacity="0.9"/>
      <rect x="22" y="10" width="12" height="10" rx="4" fill="white" opacity="0.75"/>
      <circle cx="26" cy="15" r="1.5" fill="#1e293b"/>
      <circle cx="30" cy="15" r="1.5" fill="#1e293b"/>
      <rect x="27" y="6" width="2" height="5" rx="1" fill="white" opacity="0.6"/>
      <circle cx="28" cy="5" r="2" fill="white" opacity="0.7"/>
      <circle cx="23" cy="27" r="3" fill="#1e293b"/>
      <circle cx="33" cy="27" r="3" fill="#1e293b"/>
      <circle cx="23.5" cy="26.5" r="1.3" fill="white"/>
      <circle cx="33.5" cy="26.5" r="1.3" fill="white"/>
      <rect x="24" y="33" width="8" height="2" rx="1" fill="#1e293b" opacity="0.5"/>
      <rect x="12" y="24" width="4" height="8" rx="2" fill="white" opacity="0.6"/>
      <rect x="40" y="24" width="4" height="8" rx="2" fill="white" opacity="0.6"/>
      <rect x="20" y="40" width="6" height="6" rx="2" fill="white" opacity="0.6"/>
      <rect x="30" y="40" width="6" height="6" rx="2" fill="white" opacity="0.6"/>
    </svg>
  );
}

function Robot2() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="28" cy="24" r="14" fill="white" opacity="0.9"/>
      <rect x="20" y="38" width="16" height="10" rx="4" fill="white" opacity="0.75"/>
      <circle cx="23" cy="23" r="3" fill="#1e293b"/>
      <circle cx="33" cy="23" r="3" fill="#1e293b"/>
      <circle cx="23.5" cy="22.5" r="1.2" fill="white"/>
      <circle cx="33.5" cy="22.5" r="1.2" fill="white"/>
      <path d="M24 30c1.5 2.5 6.5 2.5 8 0" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <rect x="26" y="8" width="4" height="3" rx="1.5" fill="white" opacity="0.7"/>
      <circle cx="28" cy="6.5" r="2" fill="white" opacity="0.8"/>
    </svg>
  );
}

function Robot3() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="14" y="14" width="28" height="20" rx="4" fill="white" opacity="0.9"/>
      <rect x="18" y="36" width="20" height="10" rx="3" fill="white" opacity="0.7"/>
      <rect x="18" y="18" width="8" height="6" rx="1.5" fill="#1e293b"/>
      <rect x="30" y="18" width="8" height="6" rx="1.5" fill="#1e293b"/>
      <rect x="20" y="20" width="3" height="2" rx="0.5" fill="#4ade80"/>
      <rect x="32" y="20" width="3" height="2" rx="0.5" fill="#4ade80"/>
      <rect x="22" y="28" width="12" height="3" rx="1.5" fill="#1e293b" opacity="0.4"/>
      <rect x="10" y="20" width="4" height="10" rx="2" fill="white" opacity="0.6"/>
      <rect x="42" y="20" width="4" height="10" rx="2" fill="white" opacity="0.6"/>
      <rect x="26" y="8" width="4" height="7" rx="2" fill="white" opacity="0.6"/>
      <circle cx="28" cy="7" r="2.5" fill="white" opacity="0.7"/>
    </svg>
  );
}

function Robot4() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M16 20h24c3.3 0 6 2.7 6 6v8c0 3.3-2.7 6-6 6H16c-3.3 0-6-2.7-6-6v-8c0-3.3 2.7-6 6-6z" fill="white" opacity="0.9"/>
      <circle cx="22" cy="30" r="4" fill="#1e293b"/>
      <circle cx="34" cy="30" r="4" fill="#1e293b"/>
      <circle cx="22.5" cy="29.5" r="1.8" fill="white"/>
      <circle cx="34.5" cy="29.5" r="1.8" fill="white"/>
      <rect x="26" y="35" width="4" height="2" rx="1" fill="#1e293b" opacity="0.4"/>
      <rect x="20" y="14" width="16" height="8" rx="3" fill="white" opacity="0.7"/>
      <rect x="24" y="8" width="8" height="7" rx="2" fill="white" opacity="0.5"/>
      <rect x="18" y="42" width="8" height="6" rx="2" fill="white" opacity="0.6"/>
      <rect x="30" y="42" width="8" height="6" rx="2" fill="white" opacity="0.6"/>
    </svg>
  );
}

function Robot5() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M14 28c0-7.7 6.3-14 14-14s14 6.3 14 14v10c0 2.2-1.8 4-4 4H18c-2.2 0-4-1.8-4-4V28z" fill="white" opacity="0.9"/>
      <circle cx="22" cy="26" r="3.5" fill="#1e293b"/>
      <circle cx="34" cy="26" r="3.5" fill="#1e293b"/>
      <circle cx="22.5" cy="25.5" r="1.5" fill="white"/>
      <circle cx="34.5" cy="25.5" r="1.5" fill="white"/>
      <path d="M23 34h10" stroke="#1e293b" strokeWidth="2" strokeLinecap="round"/>
      <rect x="27" y="10" width="2" height="5" rx="1" fill="white" opacity="0.6"/>
      <polygon points="28,5 30.5,9 25.5,9" fill="white" opacity="0.7"/>
      <rect x="8" y="26" width="6" height="4" rx="2" fill="white" opacity="0.5"/>
      <rect x="42" y="26" width="6" height="4" rx="2" fill="white" opacity="0.5"/>
    </svg>
  );
}

function Robot6() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="14" y="16" width="28" height="24" rx="6" fill="white" opacity="0.9"/>
      <rect x="19" y="21" width="7" height="7" rx="3.5" fill="#1e293b"/>
      <rect x="30" y="21" width="7" height="7" rx="3.5" fill="#1e293b"/>
      <circle cx="22.5" cy="24" r="1.5" fill="#facc15"/>
      <circle cx="33.5" cy="24" r="1.5" fill="#facc15"/>
      <path d="M22 33c2 2.5 4 2.5 6 0c2 2.5 4 2.5 6 0" stroke="#1e293b" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      <rect x="20" y="42" width="16" height="6" rx="3" fill="white" opacity="0.7"/>
      <circle cx="14" cy="28" r="3" fill="white" opacity="0.6"/>
      <circle cx="42" cy="28" r="3" fill="white" opacity="0.6"/>
      <rect x="24" y="9" width="8" height="8" rx="3" fill="white" opacity="0.6"/>
      <circle cx="28" cy="8" r="2" fill="white" opacity="0.8"/>
    </svg>
  );
}

function Robot7() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M16 20c0-6.6 5.4-12 12-12s12 5.4 12 12v14c0 4.4-3.6 8-8 8H24c-4.4 0-8-3.6-8-8V20z" fill="white" opacity="0.9"/>
      <rect x="20" y="22" width="5" height="3" rx="1.5" fill="#1e293b"/>
      <rect x="31" y="22" width="5" height="3" rx="1.5" fill="#1e293b"/>
      <circle cx="28" cy="30" r="2" fill="#1e293b" opacity="0.4"/>
      <path d="M24 35l2 2 4-2 2 2" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <rect x="10" y="22" width="5" height="12" rx="2.5" fill="white" opacity="0.6"/>
      <rect x="41" y="22" width="5" height="12" rx="2.5" fill="white" opacity="0.6"/>
      <rect x="26" y="6" width="4" height="4" rx="2" fill="white" opacity="0.7"/>
      <line x1="28" y1="6" x2="28" y2="2" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

function Robot8() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="16" y="16" width="24" height="18" rx="9" fill="white" opacity="0.9"/>
      <rect x="18" y="36" width="20" height="10" rx="4" fill="white" opacity="0.7"/>
      <circle cx="24" cy="25" r="3" fill="#1e293b"/>
      <circle cx="32" cy="25" r="3" fill="#1e293b"/>
      <circle cx="24.5" cy="24.5" r="1.2" fill="#f87171"/>
      <circle cx="32.5" cy="24.5" r="1.2" fill="#f87171"/>
      <path d="M26 31c1 1.5 3 1.5 4 0" fill="#1e293b" opacity="0.5"/>
      <rect x="22" y="10" width="12" height="7" rx="3" fill="white" opacity="0.6"/>
      <circle cx="28" cy="9" r="2.5" fill="white" opacity="0.8"/>
      <rect x="12" y="22" width="4" height="6" rx="2" fill="white" opacity="0.5"/>
      <rect x="40" y="22" width="4" height="6" rx="2" fill="white" opacity="0.5"/>
    </svg>
  );
}

function Robot9() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="14" y="18" width="28" height="22" rx="4" fill="white" opacity="0.9"/>
      <rect x="18" y="22" width="8" height="8" rx="2" fill="#1e293b" opacity="0.12"/>
      <rect x="30" y="22" width="8" height="8" rx="2" fill="#1e293b" opacity="0.12"/>
      <circle cx="22" cy="26" r="2.5" fill="#1e293b"/>
      <circle cx="34" cy="26" r="2.5" fill="#1e293b"/>
      <circle cx="22.5" cy="25.5" r="1" fill="#60a5fa"/>
      <circle cx="34.5" cy="25.5" r="1" fill="#60a5fa"/>
      <rect x="24" y="33" width="8" height="2.5" rx="1.25" fill="#1e293b" opacity="0.35"/>
      <rect x="25" y="34" width="1.5" height="1" rx="0.3" fill="white" opacity="0.8"/>
      <rect x="28" y="34" width="1.5" height="1" rx="0.3" fill="white" opacity="0.8"/>
      <rect x="31" y="34" width="1.5" height="1" rx="0.3" fill="white" opacity="0.8"/>
      <rect x="18" y="42" width="8" height="5" rx="2" fill="white" opacity="0.6"/>
      <rect x="30" y="42" width="8" height="5" rx="2" fill="white" opacity="0.6"/>
      <rect x="26" y="10" width="4" height="9" rx="2" fill="white" opacity="0.6"/>
      <circle cx="28" cy="9" r="2.5" fill="white" opacity="0.7"/>
    </svg>
  );
}

function Robot10() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="28" cy="26" r="14" fill="white" opacity="0.9"/>
      <ellipse cx="22" cy="24" rx="4" ry="3" fill="#1e293b"/>
      <ellipse cx="34" cy="24" rx="4" ry="3" fill="#1e293b"/>
      <circle cx="22.5" cy="23.5" r="1.5" fill="white"/>
      <circle cx="34.5" cy="23.5" r="1.5" fill="white"/>
      <ellipse cx="28" cy="32" rx="3" ry="1.5" fill="#1e293b" opacity="0.4"/>
      <rect x="22" y="40" width="12" height="8" rx="3" fill="white" opacity="0.7"/>
      <line x1="22" y1="13" x2="18" y2="7" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <line x1="34" y1="13" x2="38" y2="7" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
      <circle cx="17" cy="6" r="2.5" fill="white" opacity="0.7"/>
      <circle cx="39" cy="6" r="2.5" fill="white" opacity="0.7"/>
    </svg>
  );
}

function Robot11() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M14 26c0-7.7 6.3-14 14-14s14 6.3 14 14v8c0 3.3-2.7 6-6 6H20c-3.3 0-6-2.7-6-6v-8z" fill="white" opacity="0.9"/>
      <rect x="18" y="24" width="20" height="8" rx="4" fill="#1e293b" opacity="0.1"/>
      <circle cx="23" cy="28" r="3" fill="#1e293b"/>
      <circle cx="33" cy="28" r="3" fill="#1e293b"/>
      <circle cx="23.5" cy="27.5" r="1.2" fill="#a78bfa"/>
      <circle cx="33.5" cy="27.5" r="1.2" fill="#a78bfa"/>
      <rect x="25" y="35" width="6" height="2" rx="1" fill="#1e293b" opacity="0.3"/>
      <rect x="20" y="42" width="6" height="6" rx="2" fill="white" opacity="0.6"/>
      <rect x="30" y="42" width="6" height="6" rx="2" fill="white" opacity="0.6"/>
      <rect x="8" y="28" width="5" height="3" rx="1.5" fill="white" opacity="0.5"/>
      <rect x="43" y="28" width="5" height="3" rx="1.5" fill="white" opacity="0.5"/>
      <path d="M22 10l6-4 6 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.7"/>
    </svg>
  );
}

function Robot12() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="16" y="14" width="24" height="26" rx="5" fill="white" opacity="0.9"/>
      <rect x="20" y="20" width="6" height="6" rx="3" fill="#1e293b"/>
      <rect x="30" y="20" width="6" height="6" rx="3" fill="#1e293b"/>
      <circle cx="23" cy="22.5" r="1.2" fill="white"/>
      <circle cx="33" cy="22.5" r="1.2" fill="white"/>
      <rect x="22" y="30" width="12" height="6" rx="2" fill="#1e293b" opacity="0.15"/>
      <rect x="23.5" y="31" width="2" height="4" rx="0.5" fill="white" opacity="0.9"/>
      <rect x="27" y="31" width="2" height="4" rx="0.5" fill="white" opacity="0.9"/>
      <rect x="30.5" y="31" width="2" height="4" rx="0.5" fill="white" opacity="0.9"/>
      <rect x="20" y="42" width="16" height="6" rx="3" fill="white" opacity="0.7"/>
      <rect x="10" y="22" width="5" height="10" rx="2.5" fill="white" opacity="0.6"/>
      <rect x="41" y="22" width="5" height="10" rx="2.5" fill="white" opacity="0.6"/>
      <rect x="26" y="6" width="4" height="9" rx="2" fill="white" opacity="0.6"/>
    </svg>
  );
}

function Robot13() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <ellipse cx="28" cy="28" rx="16" ry="13" fill="white" opacity="0.9"/>
      <circle cx="22" cy="26" r="4" fill="#1e293b"/>
      <circle cx="34" cy="26" r="4" fill="#1e293b"/>
      <circle cx="22.5" cy="25.5" r="1.8" fill="white"/>
      <circle cx="34.5" cy="25.5" r="1.8" fill="white"/>
      <path d="M25 34c1.5 2 4.5 2 6 0" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <rect x="18" y="42" width="8" height="6" rx="3" fill="white" opacity="0.6"/>
      <rect x="30" y="42" width="8" height="6" rx="3" fill="white" opacity="0.6"/>
      <circle cx="18" cy="14" r="3" fill="white" opacity="0.6"/>
      <circle cx="38" cy="14" r="3" fill="white" opacity="0.6"/>
      <line x1="20" y1="16" x2="23" y2="20" stroke="white" strokeWidth="1.5" opacity="0.5"/>
      <line x1="36" y1="16" x2="33" y2="20" stroke="white" strokeWidth="1.5" opacity="0.5"/>
    </svg>
  );
}

function Robot14() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <path d="M18 16h20c3.3 0 6 2.7 6 6v12c0 3.3-2.7 6-6 6H18c-3.3 0-6-2.7-6-6V22c0-3.3 2.7-6 6-6z" fill="white" opacity="0.9"/>
      <circle cx="24" cy="26" r="3.5" fill="#1e293b"/>
      <circle cx="32" cy="26" r="3.5" fill="#1e293b"/>
      <circle cx="24.5" cy="25.5" r="1.5" fill="#34d399"/>
      <circle cx="32.5" cy="25.5" r="1.5" fill="#34d399"/>
      <path d="M24 33h8" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="18" y="42" width="20" height="6" rx="3" fill="white" opacity="0.7"/>
      <rect x="22" y="48" width="4" height="4" rx="1.5" fill="white" opacity="0.5"/>
      <rect x="30" y="48" width="4" height="4" rx="1.5" fill="white" opacity="0.5"/>
      <rect x="26" y="8" width="4" height="9" rx="2" fill="white" opacity="0.6"/>
      <rect x="23" y="6" width="10" height="4" rx="2" fill="white" opacity="0.5"/>
    </svg>
  );
}

function Robot15() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="14" y="18" width="28" height="20" rx="10" fill="white" opacity="0.9"/>
      <rect x="18" y="40" width="20" height="8" rx="3" fill="white" opacity="0.7"/>
      <circle cx="22" cy="27" r="3.5" fill="#1e293b"/>
      <circle cx="34" cy="27" r="3.5" fill="#1e293b"/>
      <circle cx="22.5" cy="26.5" r="1.5" fill="#fb923c"/>
      <circle cx="34.5" cy="26.5" r="1.5" fill="#fb923c"/>
      <path d="M26 34c1 1.2 3 1.2 4 0" fill="#1e293b" opacity="0.5"/>
      <circle cx="16" cy="17" r="2.5" fill="white" opacity="0.6"/>
      <circle cx="40" cy="17" r="2.5" fill="white" opacity="0.6"/>
      <line x1="16" y1="15" x2="14" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      <line x1="40" y1="15" x2="42" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      <circle cx="13.5" cy="8" r="2" fill="white" opacity="0.6"/>
      <circle cx="42.5" cy="8" r="2" fill="white" opacity="0.6"/>
    </svg>
  );
}

function Robot16() {
  return (
    <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect x="16" y="16" width="24" height="20" rx="4" fill="white" opacity="0.9"/>
      <rect x="18" y="38" width="20" height="10" rx="4" fill="white" opacity="0.7"/>
      <rect x="20" y="20" width="16" height="8" rx="2" fill="#1e293b" opacity="0.1"/>
      <circle cx="24" cy="24" r="2.5" fill="#1e293b"/>
      <circle cx="32" cy="24" r="2.5" fill="#1e293b"/>
      <circle cx="24.5" cy="23.5" r="1" fill="#38bdf8"/>
      <circle cx="32.5" cy="23.5" r="1" fill="#38bdf8"/>
      <path d="M24 31c2 2 4 2 4 0c2 2 4 0 4 0" stroke="#1e293b" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
      <rect x="10" y="24" width="5" height="6" rx="2.5" fill="white" opacity="0.6"/>
      <rect x="41" y="24" width="5" height="6" rx="2.5" fill="white" opacity="0.6"/>
      <rect x="25" y="8" width="6" height="9" rx="3" fill="white" opacity="0.65"/>
      <circle cx="28" cy="7" r="2.5" fill="white" opacity="0.8"/>
    </svg>
  );
}

/* ─── Avatar definitions ─── */
export var AVATARS: AvatarDef[] = [
  { id: "robot1",   label: "Robo Vermelho",   bg: "", bgStyle: { background: "linear-gradient(135deg, #ef4444, #b91c1c)" }, svg: <Robot1 /> },
  { id: "robot2",   label: "Robo Azul",       bg: "", bgStyle: { background: "linear-gradient(135deg, #3b82f6, #1d4ed8)" }, svg: <Robot2 /> },
  { id: "robot3",   label: "Robo Verde",       bg: "", bgStyle: { background: "linear-gradient(135deg, #22c55e, #15803d)" }, svg: <Robot3 /> },
  { id: "robot4",   label: "Robo Roxo",        bg: "", bgStyle: { background: "linear-gradient(135deg, #8b5cf6, #6d28d9)" }, svg: <Robot4 /> },
  { id: "robot5",   label: "Robo Laranja",     bg: "", bgStyle: { background: "linear-gradient(135deg, #f97316, #c2410c)" }, svg: <Robot5 /> },
  { id: "robot6",   label: "Robo Amarelo",     bg: "", bgStyle: { background: "linear-gradient(135deg, #eab308, #a16207)" }, svg: <Robot6 /> },
  { id: "robot7",   label: "Robo Indigo",      bg: "", bgStyle: { background: "linear-gradient(135deg, #6366f1, #4338ca)" }, svg: <Robot7 /> },
  { id: "robot8",   label: "Robo Rosa",        bg: "", bgStyle: { background: "linear-gradient(135deg, #ec4899, #be185d)" }, svg: <Robot8 /> },
  { id: "robot9",   label: "Robo Ciano",       bg: "", bgStyle: { background: "linear-gradient(135deg, #06b6d4, #0e7490)" }, svg: <Robot9 /> },
  { id: "robot10",  label: "Robo Esmeralda",   bg: "", bgStyle: { background: "linear-gradient(135deg, #10b981, #047857)" }, svg: <Robot10 /> },
  { id: "robot11",  label: "Robo Violeta",     bg: "", bgStyle: { background: "linear-gradient(135deg, #a855f7, #7e22ce)" }, svg: <Robot11 /> },
  { id: "robot12",  label: "Robo Cinza",       bg: "", bgStyle: { background: "linear-gradient(135deg, #64748b, #334155)" }, svg: <Robot12 /> },
  { id: "robot13",  label: "Robo Sky",         bg: "", bgStyle: { background: "linear-gradient(135deg, #0ea5e9, #0369a1)" }, svg: <Robot13 /> },
  { id: "robot14",  label: "Robo Teal",        bg: "", bgStyle: { background: "linear-gradient(135deg, #14b8a6, #0f766e)" }, svg: <Robot14 /> },
  { id: "robot15",  label: "Robo Fuchsia",     bg: "", bgStyle: { background: "linear-gradient(135deg, #d946ef, #a21caf)" }, svg: <Robot15 /> },
  { id: "robot16",  label: "Robo Slate",       bg: "", bgStyle: { background: "linear-gradient(135deg, #475569, #1e293b)" }, svg: <Robot16 /> },
];

/** Get a random avatar ID */
export function getRandomAvatarId(): string {
  var idx = Math.floor(Math.random() * AVATARS.length);
  return AVATARS[idx].id;
}

/** Find avatar by ID */
export function getAvatarById(id: string): AvatarDef | undefined {
  return AVATARS.find(function (a) { return a.id === id; });
}

/* ─── Avatar display component ─── */
interface AvatarDisplayProps {
  avatarId?: string | null;
  customAvatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

var sizeMap = {
  xs: { container: "w-5 h-5", icon: "w-5 h-5" },
  sm: { container: "w-8 h-8", icon: "w-8 h-8" },
  md: { container: "w-12 h-12", icon: "w-12 h-12" },
  lg: { container: "w-16 h-16", icon: "w-16 h-16" },
  xl: { container: "w-24 h-24", icon: "w-24 h-24" },
};

export function UserAvatar({ avatarId, customAvatarUrl, size, className }: AvatarDisplayProps) {
  var s = size || "md";
  var sizes = sizeMap[s];

  // Custom uploaded image takes priority
  if (customAvatarUrl) {
    return (
      <div className={"rounded-full overflow-hidden flex-shrink-0 " + sizes.container + " " + (className || "")}>
        <img src={customAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
      </div>
    );
  }

  // Robot avatar
  var avatar = avatarId ? getAvatarById(avatarId) : null;
  if (!avatar) {
    avatar = AVATARS[0]; // fallback
  }

  return (
    <div
      className={"rounded-full flex items-center justify-center flex-shrink-0 text-white " + sizes.container + " " + (className || "")}
      style={avatar.bgStyle}
    >
      <div className={sizes.icon} style={{ padding: "12%" }}>
        {avatar.svg}
      </div>
    </div>
  );
}

/* ─── Avatar picker modal/section ─── */
interface AvatarPickerProps {
  currentAvatarId?: string | null;
  currentCustomUrl?: string | null;
  onSelectAvatar: (avatarId: string) => void;
  onUploadCustom: (file: File) => Promise<void>;
  onRemoveCustom?: () => void;
  uploading?: boolean;
}

export function AvatarPicker({ currentAvatarId, currentCustomUrl, onSelectAvatar, onUploadCustom, onRemoveCustom, uploading }: AvatarPickerProps) {
  var [showPicker, setShowPicker] = useState(false);
  var fileInputRef = useRef<HTMLInputElement>(null);

  var handleFileChange = function (e: React.ChangeEvent<HTMLInputElement>) {
    var file = e.target.files?.[0];
    if (file) {
      // Validate
      var validTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
      if (!validTypes.includes(file.type)) {
        alert("Formato nao suportado. Use PNG, JPEG, WebP ou GIF.");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        alert("Imagem muito grande. Maximo: 2MB.");
        return;
      }
      onUploadCustom(file);
    }
    e.target.value = "";
  };

  return (
    <div>
      {/* Current avatar with edit button */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <UserAvatar avatarId={currentAvatarId} customAvatarUrl={currentCustomUrl} size="xl" />
          <button
            onClick={function () { setShowPicker(!showPicker); }}
            className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            type="button"
          >
            <Camera className="w-6 h-6 text-white" />
          </button>
        </div>
        <div>
          <button
            onClick={function () { setShowPicker(!showPicker); }}
            className="text-red-600 hover:text-red-700 transition-colors cursor-pointer"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
            type="button"
          >
            {showPicker ? "Fechar" : "Alterar foto"}
          </button>
          <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.72rem" }}>
            Escolha um robozinho ou envie sua foto
          </p>
        </div>
      </div>

      {/* Picker panel */}
      {showPicker && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-4">
          {/* Robot avatars grid */}
          <div>
            <p className="text-gray-700 mb-3" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Escolha seu robozinho
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {AVATARS.map(function (avatar) {
                var isSelected = !currentCustomUrl && currentAvatarId === avatar.id;
                return (
                  <div key={avatar.id} className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={function () {
                        onSelectAvatar(avatar.id);
                        if (onRemoveCustom && currentCustomUrl) onRemoveCustom();
                      }}
                      className={"relative w-12 h-12 rounded-full transition-all cursor-pointer overflow-visible " +
                        (isSelected
                          ? "ring-3 ring-red-500 ring-offset-2 scale-110"
                          : "hover:scale-110 hover:ring-2 hover:ring-gray-300 hover:ring-offset-1"
                        )}
                      title={avatar.label}
                      style={{ flexShrink: 0 }}
                    >
                      <UserAvatar avatarId={avatar.id} size="md" className="w-12 h-12" />
                      {isSelected && (
                        <div className="absolute -bottom-0.5 -right-0.5 bg-red-500 rounded-full p-0.5 z-10">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200" />

          {/* Upload custom */}
          <div>
            <p className="text-gray-700 mb-2" style={{ fontSize: "0.82rem", fontWeight: 600 }}>
              Ou envie sua propria foto
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={function () { fileInputRef.current?.click(); }}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all cursor-pointer disabled:opacity-50"
                style={{ fontSize: "0.82rem", fontWeight: 500 }}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {uploading ? "Enviando..." : "Escolher imagem"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.gif"
                onChange={handleFileChange}
                className="hidden"
              />
              {currentCustomUrl && onRemoveCustom && (
                <button
                  type="button"
                  onClick={onRemoveCustom}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                  style={{ fontSize: "0.8rem", fontWeight: 500 }}
                >
                  <X className="w-3.5 h-3.5" />
                  Remover foto
                </button>
              )}
            </div>
            <p className="text-gray-400 mt-1.5" style={{ fontSize: "0.7rem" }}>
              PNG, JPEG, WebP ou GIF. Maximo: 2MB. A imagem sera recortada em circulo.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
