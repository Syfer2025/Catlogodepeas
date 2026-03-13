import { useEffect, useRef } from "react";
import { useCart } from "../contexts/CartContext";
import { supabase } from "../services/supabaseClient";
import * as api from "../services/api";

// ═══════════════════════════════════════════════════════════════════
// Cart Abandoned Tracker
// Watches cart changes and syncs a snapshot to the server for
// WhatsApp abandoned-cart recovery. Only fires for logged-in users.
//
// ● Debounces by 30s to avoid spamming the API on rapid add/remove.
// ● Skips admin pages entirely.
// ● Only sends if cart has items AND user has a phone or email.
// ═══════════════════════════════════════════════════════════════════

var DEBOUNCE_MS = 30000; // 30 seconds

export function CartAbandonedTracker() {
  var { items, totalPrice } = useCart();
  var timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  var lastSnapshotRef = useRef<string>(""); // serialized key to avoid re-sending identical data

  useEffect(function () {
    // Skip admin pages
    if (window.location.pathname.startsWith("/admin")) return;

    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // No items → nothing to track
    if (items.length === 0) return;

    timerRef.current = setTimeout(function () {
      // Get session to check if user is logged in
      supabase.auth.getSession().then(function (result) {
        var session = result.data?.session;
        if (!session?.user) return; // Not logged in — skip

        var user = session.user;
        var email = user.email || "";
        var name = user.user_metadata?.name || "";
        var phone = user.user_metadata?.phone || "";

        // If we still don't have phone, try loading from profile
        // (user_metadata may not have phone set — fetch from our profile)
        if (!phone) {
          api.userMe(session.access_token).then(function (profile) {
            var profilePhone = (profile.phone || "").replace(/\D/g, "");
            var profileName = profile.name || name;
            var profileEmail = profile.email || email;
            _sendSnapshot(profilePhone, profileEmail, profileName);
          }).catch(function () {
            // Even without phone, we can use email as fallback
            _sendSnapshot("", email, name);
          });
        } else {
          _sendSnapshot(phone.replace(/\D/g, ""), email, name);
        }
      }).catch(function () {
        // Not logged in or error — skip silently
      });
    }, DEBOUNCE_MS);

    function _sendSnapshot(phone: string, email: string, name: string) {
      if (!phone && !email) return; // Need at least one identifier

      // Build a simple key to avoid re-sending identical snapshots
      var snapshotKey = (phone || email) + ":" + items.length + ":" + Math.round(totalPrice * 100);
      if (snapshotKey === lastSnapshotRef.current) return;

      api.saveCartSnapshot({
        phone: phone,
        email: email,
        name: name,
        items: items.map(function (i) {
          return {
            sku: i.sku,
            titulo: i.titulo,
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
          };
        }),
        totalPrice: totalPrice,
      }).then(function () {
        lastSnapshotRef.current = snapshotKey;
      }).catch(function () {
        // Silently ignore — non-critical feature
      });
    }

    return function () {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [items, totalPrice]);

  return null; // This component renders nothing
}
