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

  const { mounted, visible } = useDelayedVisibility(isOpen, 250);

  useEffect(() => {
    api
      .getCategoryTree()
      .then(async (data) => {
        if (Array.isArray(data) && data.length > 0) {
          setTree(data);
        } else {
          try {
            await api.saveCategoryTree(defaultCategoryTree);
            setTree(defaultCategoryTree);
          } catch {
            setTree(defaultCategoryTree);
          }
        }
      })
      .catch((e) => {
        console.error("Error loading category tree for menu:", e);
        setTree(defaultCategoryTree);
      })
      .finally(() => setLoading(false));
  }, []);

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
    closeTimerRef.current = setTimeout(() => setIsOpen(false), 250);
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
        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg transition-all duration-200 ${
          isOpen
            ? "bg-red-600 text-white shadow-sm"
            : "text-gray-700 hover:text-red-600 hover:bg-red-50"
        }`}
        style={{ fontSize: "0.9rem", fontWeight: 500 }}
      >
        <Layers className="w-4 h-4" />
        Categorias
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform duration-300 ease-out"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Dropdown mega-menu — always mounted while animating */}
      {mounted && (
        <div
          className="absolute top-full z-[200] pt-0"
          onMouseEnter={() => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
          }}
          style={{
            left: `${dropdownLeft}px`,
            width: dropdownWidth > 0 ? `${dropdownWidth}px` : "min(1060px, calc(100vw - 2rem))",
            transition: "opacity 220ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(-8px)",
            pointerEvents: visible ? "auto" : "none",
          }}
        >
          <div
            className="bg-white rounded-b-xl shadow-2xl border border-gray-200 border-t-2 border-t-red-600 flex overflow-hidden w-full"
            style={{
              maxHeight: `${availableHeight}px`,
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
                  <div className="flex-1 overflow-y-auto min-h-0">
                    {sortedTree.map((parent) => {
                      const isActive = activeParent === parent.id;
                      return (
                        <button
                          key={parent.id}
                          onMouseEnter={() => setActiveParent(parent.id)}
                          onClick={() => {
                            if (!parent.children || parent.children.length === 0) {
                              handleLinkClick();
                            }
                          }}
                          className={`w-full text-left px-4 ${leftColItemPy} flex items-center justify-between gap-2`}
                          style={{
                            fontSize: leftColFontSize,
                            transition: "background-color 180ms ease, color 180ms ease",
                            backgroundColor: isActive ? "rgb(254 242 242)" : "transparent",
                            color: isActive ? "rgb(185 28 28)" : "rgb(55 65 81)",
                          }}
                        >
                          <span
                            className="truncate"
                            style={{
                              fontWeight: isActive ? 600 : 400,
                              transition: "font-weight 150ms ease",
                            }}
                          >
                            {parent.name}
                          </span>
                          {parent.children && parent.children.length > 0 && (
                            <ChevronRight
                              className="w-3.5 h-3.5 shrink-0 transition-all duration-200"
                              style={{
                                color: isActive ? "rgb(248 113 113)" : "rgb(209 213 219)",
                                transform: isActive ? "translateX(2px)" : "translateX(0)",
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
                      transition: "opacity 160ms ease, transform 160ms ease",
                      opacity: panelFade ? 1 : 0,
                      transform: panelFade ? "translateX(0)" : "translateX(6px)",
                    }}
                  >
                    {activeParent ? (
                      <ChildrenPanel
                        parent={tree.find((p) => p.id === activeParent) || null}
                        onLinkClick={handleLinkClick}
                        compact={availableHeight < 500}
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
      )}
    </div>
  );
}

/* ─── Children Panel ─── */
function ChildrenPanel({
  parent,
  onLinkClick,
  compact = false,
}: {
  parent: CategoryNode | null;
  onLinkClick: () => void;
  compact?: boolean;
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

      {/* Children via CSS multi-column for balanced distribution */}
      <div
        style={{
          columnCount: colCount,
          columnGap: "1.5rem",
        }}
      >
        {sorted.map((child, idx) => (
          <div
            key={child.id}
            style={{
              breakInside: "avoid",
              WebkitColumnBreakInside: "avoid",
              animation: "megaMenuFadeIn 200ms ease both",
              animationDelay: `${idx * 18}ms`,
              marginBottom: child.children && child.children.length > 0 ? "0.5rem" : "0",
            }}
          >
            {child.children && child.children.length > 0 ? (
              <div className="mb-0.5">
                <Link
                  to={`/catalogo?categoria=${child.slug}`}
                  onClick={onLinkClick}
                  className={`text-gray-700 hover:text-red-600 block ${itemPy}`}
                  style={{ fontSize: itemFont, fontWeight: 600, transition: "color 150ms ease" }}
                >
                  {child.name}
                </Link>
                <div className="pl-2.5 border-l-2 border-gray-100">
                  {child.children.map((gc) => (
                    <Link
                      key={gc.id}
                      to={`/catalogo?categoria=${gc.slug}`}
                      onClick={onLinkClick}
                      className="block text-gray-500 hover:text-red-600 py-0.5"
                      style={{ fontSize: subItemFont, transition: "color 150ms ease" }}
                    >
                      {gc.name}
                    </Link>
                  ))}
                </div>
              </div>
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
        ))}
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes megaMenuFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
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
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    api
      .getCategoryTree()
      .then((data) => {
        if (Array.isArray(data)) setTree(data);
      })
      .catch((e) => console.error("Error loading category tree for mobile:", e))
      .finally(() => setLoading(false));
  }, []);

  if (tree.length === 0 && !loading) return null;

  // Sort parents alphabetically for mobile display
  const sortedTree = sortByName(tree);

  return (
    <div className="pt-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors duration-200"
      >
        <div className="flex items-center gap-2.5">
          <div className="bg-red-50 rounded-full p-1.5">
            <Layers className="w-4 h-4 text-red-600" />
          </div>
          <span className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Categorias
          </span>
        </div>
        <ChevronDown
          className="w-4 h-4 text-gray-400 transition-transform duration-300 ease-out"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Animated container */}
      <div
        className="overflow-hidden"
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1 mx-2 bg-gray-50 rounded-lg border border-gray-200 overflow-hidden max-h-[60vh] overflow-y-auto">
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
                    setIsOpen(false);
                    onNavigate?.();
                  }}
                />
              ))
            )}
          </div>
        </div>
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
}: {
  parent: CategoryNode;
  isExpanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const hasChildren = parent.children && parent.children.length > 0;
  const sortedChildren = hasChildren ? sortByName(parent.children!) : [];

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white transition-colors duration-200"
      >
        <span className="text-gray-700 truncate" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
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
              {sortedChildren.map((child, idx) => (
                <Link
                  key={child.id}
                  to={`/catalogo?categoria=${child.slug}`}
                  onClick={onNavigate}
                  className="block text-gray-500 hover:text-red-600 py-1.5 pl-2 border-l-2 border-gray-200 transition-colors duration-150"
                  style={{
                    fontSize: "0.78rem",
                    animation: isExpanded ? `mobileItemSlideIn 200ms ease both` : "none",
                    animationDelay: `${idx * 25}ms`,
                  }}
                >
                  {child.name}
                </Link>
              ))}
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