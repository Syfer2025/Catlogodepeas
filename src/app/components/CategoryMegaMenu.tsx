import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router";
import {
  Layers,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import * as api from "../services/api";
import type { CategoryNode } from "../services/api";
import { defaultCategoryTree } from "../data/categoryTree";
import { useHomepageInit } from "../contexts/HomepageInitContext";

/* ─── Sort helper: locale-aware alphabetical ─── */
function sortByName(nodes: CategoryNode[]): CategoryNode[] {
  return [...nodes].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function sortTreeRecursive(nodes: CategoryNode[]): CategoryNode[] {
  return sortByName(nodes).map((n) => ({
    ...n,
    children: n.children ? sortTreeRecursive(n.children) : undefined,
  }));
}

/* ─── Shared hook: smooth open/close visibility ─── */
function useDelayedVisibility(isOpen: boolean, closeDelay = 220) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // trigger CSS transition on next frame
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), closeDelay);
      return () => clearTimeout(t);
    }
  }, [isOpen, closeDelay]);

  return { mounted, visible };
}

/* ═══════════════════════════════════════════════════
   Desktop Mega-Menu
   ═══════════════════════════════════════════════════ */

interface CategoryMegaMenuProps {
  onNavigate?: () => void;
}

export function CategoryMegaMenu({ onNavigate }: CategoryMegaMenuProps) {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [activeParent, setActiveParent] = useState<string | null>(null);
  const [prevParent, setPrevParent] = useState<string | null>(null);
  const [panelFade, setPanelFade] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [availableHeight, setAvailableHeight] = useState(500);
  const [dropdownLeft, setDropdownLeft] = useState(0);
  const [dropdownWidth, setDropdownWidth] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  const { mounted, visible } = useDelayedVisibility(isOpen, 320);
  const { data: initData, loading: initLoading } = useHomepageInit();

  // Use category tree from combined init data (no separate API call)
  useEffect(() => {
    if (initLoading) return;
    if (initData && Array.isArray(initData.categoryTree) && initData.categoryTree.length > 0) {
      setTree(initData.categoryTree);
      setCategoryCounts(initData.categoryCounts || {});
      setLoading(false);
    } else {
      // Fallback: no data from init, use defaults
      setTree(defaultCategoryTree);
      setCategoryCounts({});
      setLoading(false);
    }
  }, [initData, initLoading]);

  // Calculate available height and dropdown dimensions to span full container
  const calcDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const space = window.innerHeight - rect.bottom - 16;
      setAvailableHeight(Math.max(300, space));

      // Find the parent max-w-7xl container to span its full width
      const parentContainer = containerRef.current.closest(".max-w-7xl");
      if (parentContainer) {
        const parentRect = parentContainer.getBoundingClientRect();
        const offsetLeft = parentRect.left - rect.left;
        setDropdownLeft(offsetLeft);
        setDropdownWidth(parentRect.width);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      calcDimensions();
      window.addEventListener("resize", calcDimensions);
      return () => window.removeEventListener("resize", calcDimensions);
    }
  }, [isOpen, calcDimensions]);

  // Close when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Crossfade right panel when switching parent
  useEffect(() => {
    if (activeParent !== prevParent) {
      setPanelFade(false);
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPrevParent(activeParent);
          setPanelFade(true);
        });
      });
      return () => cancelAnimationFrame(t);
    }
  }, [activeParent, prevParent]);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setActiveParent(null);
      setPrevParent(null);
    }, 250);
  };

  const handleLinkClick = () => {
    setIsOpen(false);
    onNavigate?.();
  };

  if (tree.length === 0 && !loading) return null;

  const leftColItemPy = availableHeight < 500 ? "py-1" : "py-1.5";
  const leftColFontSize = availableHeight < 500 ? "0.76rem" : "0.82rem";

  // Sort parents alphabetically for display
  const sortedTree = sortByName(tree);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={handleMouseEnter}
        className={`flex items-center gap-1.5 px-4 py-2.5 relative ${
          isOpen
            ? "bg-red-600 text-white rounded-t-lg z-[201]"
            : "text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg"
        }`}
        style={{
          fontSize: "0.9rem",
          fontWeight: isOpen ? 600 : 500,
          transition: "all 280ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          boxShadow: isOpen ? "0 -2px 12px rgba(220,38,38,0.15)" : "none",
        }}
      >
        <Layers
          className="w-4 h-4"
          style={{
            transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: isOpen ? "rotate(-15deg) scale(1.1)" : "rotate(0) scale(1)",
          }}
        />
        Categorias
        <ChevronDown
          className="w-3.5 h-3.5"
          style={{
            transition: "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown mega-menu — always mounted while animating */}
      {mounted && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 z-[199]"
            style={{
              backgroundColor: visible ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0)",
              transition: "background-color 300ms ease",
              pointerEvents: visible ? "auto" : "none",
            }}
            onMouseEnter={handleMouseLeave}
          />
          <div
            className="absolute top-full left-0 z-[200]"
            style={{ marginTop: "-1px" }}
            onMouseEnter={() => {
              if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            }}
          >
            <div
              style={{
                width: dropdownWidth > 0
                  ? `${dropdownWidth + dropdownLeft}px`
                  : "min(1060px, calc(100vw - 2rem))",
                transition: visible
                  ? "opacity 300ms cubic-bezier(0.16,1,0.3,1), transform 300ms cubic-bezier(0.34,1.56,0.64,1)"
                  : "opacity 200ms ease, transform 200ms ease",
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0) scale(1)" : "translateY(-12px) scale(0.98)",
                transformOrigin: "top left",
                pointerEvents: visible ? "auto" : "none",
              }}
            >
              {/* Animated red accent bar */}
              <div
                style={{
                  height: "3px",
                  background: "linear-gradient(90deg, rgb(220 38 38), rgb(248 113 113), rgb(220 38 38))",
                  backgroundSize: "200% 100%",
                  transform: visible ? "scaleX(1)" : "scaleX(0)",
                  transformOrigin: "left",
                  transition: visible
                    ? "transform 400ms cubic-bezier(0.34,1.56,0.64,1) 80ms"
                    : "transform 150ms ease",
                  animationName: visible ? "megaMenuShimmer" : "none",
                  animationDuration: "3s",
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                }}
              />
              <div
                className="bg-white flex overflow-hidden w-full"
                style={{
                  maxHeight: `${availableHeight}px`,
                  borderRadius: "0 0 0.75rem 0.75rem",
                  boxShadow: visible
                    ? "0 20px 60px -12px rgba(0,0,0,0.18), 0 8px 20px -8px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)"
                    : "0 4px 12px rgba(0,0,0,0.05)",
                  transition: "box-shadow 400ms ease",
                }}
              >
                {loading ? (
                  <div className="flex items-center justify-center p-10 w-full">
                    <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Left column: parent categories */}
                    <div
                      className="border-r border-gray-100 py-1.5 shrink-0 flex flex-col"
                      style={{ width: "260px", maxHeight: `${availableHeight}px` }}
                    >
                      <p
                        className="px-4 py-1.5 text-gray-400 shrink-0"
                        style={{
                          fontSize: "0.62rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Departamentos ({tree.length})
                      </p>
                      <div className="flex-1 overflow-y-auto min-h-0 px-1.5">
                        {sortedTree.map((parent, idx) => {
                          const isActive = activeParent === parent.id;
                          const parentCount = categoryCounts[parent.slug] || 0;
                          const isEmpty = parentCount === 0;
                          return (
                            <button
                              key={parent.id}
                              onMouseEnter={() => setActiveParent(parent.id)}
                              onClick={() => {
                                if (!parent.children || parent.children.length === 0) {
                                  handleLinkClick();
                                }
                              }}
                              className={`w-full text-left px-4 ${leftColItemPy} flex items-center justify-between gap-2 my-0.5`}
                              style={{
                                fontSize: leftColFontSize,
                                fontWeight: isActive ? 600 : 400,
                                transition: "background-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease",
                                backgroundColor: isActive ? (isEmpty ? "rgb(229 231 235)" : "rgb(220 38 38)") : "transparent",
                                color: isActive ? (isEmpty ? "rgb(156 163 175)" : "white") : isEmpty ? "rgb(156 163 175)" : "rgb(55 65 81)",
                                borderRadius: "0.5rem",
                                boxShadow: isActive && !isEmpty
                                  ? "0 4px 12px rgba(220,38,38,0.35)"
                                  : "none",
                                opacity: isEmpty ? 0.5 : 1,
                              }}
                            >
                              <span className="truncate">
                                {parent.name}
                              </span>
                              {parent.children && parent.children.length > 0 && (
                                <ChevronRight
                                  className="w-3.5 h-3.5 shrink-0"
                                  style={{
                                    color: isActive ? (isEmpty ? "rgb(156 163 175)" : "rgba(255,255,255,0.7)") : "rgb(209 213 219)",
                                    transition: "color 180ms ease",
                                  }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right column: children of active parent — crossfade */}
                    <div
                      className="flex-1 py-3 px-5 overflow-y-auto min-h-0"
                      style={{ maxHeight: `${availableHeight}px` }}
                    >
                      <div
                        style={{
                          transition: "opacity 220ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
                          opacity: panelFade ? 1 : 0,
                          transform: panelFade ? "translateX(0) scale(1)" : "translateX(8px) scale(0.98)",
                          transformOrigin: "left center",
                        }}
                      >
                        {activeParent ? (
                          <ChildrenPanel
                            parent={tree.find((p) => p.id === activeParent) || null}
                            onLinkClick={handleLinkClick}
                            compact={availableHeight < 500}
                            categoryCounts={categoryCounts}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-gray-400 py-10">
                            <Layers className="w-8 h-8 text-gray-300 mb-3" />
                            <p style={{ fontSize: "0.85rem" }}>
                              Passe o mouse sobre um departamento
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Children Panel ─── */
function ChildrenPanel({
  parent,
  onLinkClick,
  compact = false,
  categoryCounts,
}: {
  parent: CategoryNode | null;
  onLinkClick: () => void;
  compact?: boolean;
  categoryCounts: Record<string, number>;
}) {
  if (!parent) return null;

  const children = parent.children || [];
  if (children.length === 0) {
    return (
      <div className="py-6 text-center text-gray-400" style={{ fontSize: "0.85rem" }}>
        <p className="font-semibold text-gray-700 mb-1">{parent.name}</p>
        <p>Sem subcategorias</p>
      </div>
    );
  }

  // Sort children alphabetically, and grandchildren within each child
  const sorted = sortTreeRecursive(children);

  // Decide column count based on number of items
  const colCount = sorted.length <= 6 ? 1 : sorted.length <= 14 ? 2 : 3;

  const itemPy = compact ? "py-0.5" : "py-1";
  const itemFont = compact ? "0.74rem" : "0.78rem";
  const subItemFont = compact ? "0.68rem" : "0.72rem";

  return (
    <div>
      {/* Parent title */}
      {(() => {
        const parentCount = categoryCounts[parent.slug] || 0;
        const parentEmpty = parentCount === 0;
        if (parentEmpty) {
          return (
            <span
              className="flex items-center gap-1.5 mb-3"
              style={{ fontSize: "0.9rem", fontWeight: 700, color: "rgb(156 163 175)", opacity: 0.5, cursor: "default" }}
            >
              {parent.name}
            </span>
          );
        }
        return (
          <Link
            to={`/catalogo?categoria=${parent.slug}`}
            onClick={onLinkClick}
            className="text-red-700 hover:text-red-800 flex items-center gap-1.5 mb-3 group/title"
            style={{ fontSize: "0.9rem", fontWeight: 700, transition: "color 150ms ease" }}
          >
            {parent.name}
            <ChevronRight
              className="w-3.5 h-3.5 transition-transform duration-200 group-hover/title:translate-x-0.5"
            />
          </Link>
        );
      })()}

      {/* Children via CSS multi-column for balanced distribution */}
      <div
        style={{
          columnCount: colCount,
          columnGap: "1.5rem",
        }}
      >
        {sorted.map((child, idx) => {
          const childCount = categoryCounts[child.slug] || 0;
          const childEmpty = childCount === 0;
          return (
            <div
              key={child.id}
              style={{
                breakInside: "avoid",
                WebkitColumnBreakInside: "avoid",
                animationName: "megaMenuFadeIn",
                animationDuration: "200ms",
                animationTimingFunction: "ease",
                animationDelay: (idx * 18) + "ms",
                animationFillMode: "both",
                marginBottom: child.children && child.children.length > 0 ? "0.5rem" : "0",
              }}
            >
              {child.children && child.children.length > 0 ? (
                <div className="mb-0.5">
                  {childEmpty ? (
                    <span
                      className={`block ${itemPy}`}
                      style={{ fontSize: itemFont, fontWeight: 600, color: "rgb(156 163 175)", opacity: 0.5, cursor: "default" }}
                    >
                      {child.name}
                    </span>
                  ) : (
                    <Link
                      to={`/catalogo?categoria=${child.slug}`}
                      onClick={onLinkClick}
                      className={`text-gray-700 hover:text-red-600 block ${itemPy}`}
                      style={{ fontSize: itemFont, fontWeight: 600, transition: "color 150ms ease" }}
                    >
                      {child.name}
                    </Link>
                  )}
                  <div className="pl-2.5 border-l-2 border-gray-100">
                    {child.children.map((gc) => {
                      const gcCount = categoryCounts[gc.slug] || 0;
                      const gcEmpty = gcCount === 0;
                      if (gcEmpty) {
                        return (
                          <span
                            key={gc.id}
                            className="block py-0.5"
                            style={{ fontSize: subItemFont, color: "rgb(156 163 175)", opacity: 0.5, cursor: "default" }}
                          >
                            {gc.name}
                          </span>
                        );
                      }
                      return (
                        <Link
                          key={gc.id}
                          to={`/catalogo?categoria=${gc.slug}`}
                          onClick={onLinkClick}
                          className="block text-gray-500 hover:text-red-600 py-0.5"
                          style={{ fontSize: subItemFont, transition: "color 150ms ease" }}
                        >
                          {gc.name}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : childEmpty ? (
                <span
                  className={`block ${itemPy}`}
                  style={{ fontSize: itemFont, color: "rgb(156 163 175)", opacity: 0.5, cursor: "default" }}
                >
                  {child.name}
                </span>
              ) : (
                <Link
                  to={`/catalogo?categoria=${child.slug}`}
                  onClick={onLinkClick}
                  className={`block text-gray-600 hover:text-red-600 ${itemPy}`}
                  style={{ fontSize: itemFont, transition: "color 150ms ease" }}
                >
                  {child.name}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes megaMenuFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes megaMenuShimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes megaMenuItemSlideIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Mobile Categories Accordion
   ═══════════════════════════════════════════════════ */

export function MobileCategoryMenu({ onNavigate }: { onNavigate?: () => void }) {
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const { data: initData, loading: initLoading } = useHomepageInit();

  // Use category tree from combined init data
  useEffect(() => {
    if (initLoading) return;
    if (initData && Array.isArray(initData.categoryTree) && initData.categoryTree.length > 0) {
      setTree(initData.categoryTree);
      setCategoryCounts(initData.categoryCounts || {});
    } else {
      setTree(defaultCategoryTree);
      setCategoryCounts({});
    }
    setLoading(false);
  }, [initData, initLoading]);

  if (tree.length === 0 && !loading) return null;

  // Sort parents alphabetically for mobile display
  const sortedTree = sortByName(tree);

  return (
    <div className="pt-1">
      {/* Categories list — shown directly without extra toggle */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden max-h-[65vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
          </div>
        ) : (
          sortedTree.map((parent) => (
            <MobileParentItem
              key={parent.id}
              parent={parent}
              isExpanded={openSection === parent.id}
              onToggle={() =>
                setOpenSection(openSection === parent.id ? null : parent.id)
              }
              onNavigate={() => {
                onNavigate?.();
              }}
              categoryCounts={categoryCounts}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Mobile Parent Item with animated children ─── */
function MobileParentItem({
  parent,
  isExpanded,
  onToggle,
  onNavigate,
  categoryCounts,
}: {
  parent: CategoryNode;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  categoryCounts: Record<string, number>;
}) {
  const hasChildren = parent.children && parent.children.length > 0;
  const sortedChildren = hasChildren ? sortByName(parent.children!) : [];
  const parentCount = categoryCounts[parent.slug] || 0;
  const parentEmpty = parentCount === 0;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white transition-colors duration-200"
        style={{ opacity: parentEmpty ? 0.5 : 1 }}
      >
        <span
          className="truncate"
          style={{
            fontSize: "0.82rem",
            fontWeight: 500,
            color: parentEmpty ? "rgb(156 163 175)" : "rgb(55 65 81)",
          }}
        >
          {parent.name}
        </span>
        {hasChildren && (
          <ChevronDown
            className="w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-300 ease-out"
            style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        )}
      </button>

      {/* Animated accordion */}
      {hasChildren && (
        <div
          style={{
            display: "grid",
            gridTemplateRows: isExpanded ? "1fr" : "0fr",
            transition: "grid-template-rows 280ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="bg-white px-4 pb-2">
              {sortedChildren.map((child, idx) => {
                const childCount = categoryCounts[child.slug] || 0;
                const childEmpty = childCount === 0;
                if (childEmpty) {
                  return (
                    <span
                      key={child.id}
                      className="block py-1.5 pl-2 border-l-2 border-gray-200"
                      style={{
                        fontSize: "0.78rem",
                        color: "rgb(156 163 175)",
                        opacity: 0.5,
                        cursor: "default",
                        animationName: isExpanded ? "mobileItemSlideIn" : "none",
                        animationDuration: "200ms",
                        animationTimingFunction: "ease",
                        animationDelay: (idx * 25) + "ms",
                        animationFillMode: "both",
                      }}
                    >
                      {child.name}
                    </span>
                  );
                }
                return (
                  <Link
                    key={child.id}
                    to={`/catalogo?categoria=${child.slug}`}
                    onClick={onNavigate}
                    className="block text-gray-500 hover:text-red-600 py-1.5 pl-2 border-l-2 border-gray-200 transition-colors duration-150"
                    style={{
                      fontSize: "0.78rem",
                      animationName: isExpanded ? "mobileItemSlideIn" : "none",
                      animationDuration: "200ms",
                      animationTimingFunction: "ease",
                      animationDelay: (idx * 25) + "ms",
                      animationFillMode: "both",
                    }}
                  >
                    {child.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes mobileItemSlideIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}