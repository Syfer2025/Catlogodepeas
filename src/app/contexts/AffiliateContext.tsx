import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as api from "../services/api";

const COOKIE_NAME = "carretao_ref";
const COOKIE_DAYS = 30;

interface AffiliateContextValue {
  affiliateCode: string | null;
  clearAffiliateCode: () => void;
}

const AffiliateContext = createContext<AffiliateContextValue>({
  affiliateCode: null,
  clearAffiliateCode: function () {},
});

export function useAffiliate() {
  return useContext(AffiliateContext);
}

function getCookie(name: string): string | null {
  var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days: number) {
  var d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = name + "=" + encodeURIComponent(value) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax";
}

function deleteCookie(name: string) {
  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
}

export function AffiliateProvider({ children }: { children: React.ReactNode }) {
  var [code, setCode] = useState<string | null>(null);

  useEffect(function () {
    // 1. Check URL for ?ref=CODE
    var params = new URLSearchParams(window.location.search);
    var refCode = params.get("ref");

    if (refCode && refCode.trim()) {
      var cleanCode = refCode.trim().toUpperCase();
      setCookie(COOKIE_NAME, cleanCode, COOKIE_DAYS);
      setCode(cleanCode);

      // Track click
      api.affiliateTrackClick(cleanCode).catch(function (e) {
        console.warn("[Affiliate] Track click error:", e);
      });

      // Clean URL (remove ref param without reload)
      params.delete("ref");
      var newSearch = params.toString();
      var newUrl = window.location.pathname + (newSearch ? "?" + newSearch : "") + window.location.hash;
      window.history.replaceState({}, "", newUrl);
    } else {
      // 2. Check existing cookie
      var existingCode = getCookie(COOKIE_NAME);
      if (existingCode) {
        setCode(existingCode);
      }
    }
  }, []);

  var clearAffiliateCode = useCallback(function () {
    deleteCookie(COOKIE_NAME);
    setCode(null);
  }, []);

  return React.createElement(
    AffiliateContext.Provider,
    { value: { affiliateCode: code, clearAffiliateCode: clearAffiliateCode } },
    children
  );
}
