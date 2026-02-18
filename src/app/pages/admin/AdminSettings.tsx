import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../services/supabaseClient";
import * as api from "../../services/api";
import type { SiteSettings, LogoMeta } from "../../services/api";
import {
  Save, Store, Globe, Bell, Palette, Shield, Check, Loader2, Database,
  Upload, Trash2, ImageIcon, FileWarning, X, DollarSign,
} from "lucide-react";

const defaultSettings: SiteSettings = {
  storeName: "AutoParts",
  storeSubtitle: "Catalogo de Pecas",
  email: "contato@autoparts.com.br",
  phone: "(11) 99999-9999",
  address: "Rua das Pecas, 1234 - Centro, Sao Paulo - SP",
  cep: "01000-000",
  cnpj: "00.000.000/0001-00",
  freeShippingMin: "299.90",
  maxInstallments: "12",
  workdaysHours: "8h - 18h",
  saturdayHours: "8h - 13h",
  whatsapp: "(11) 99999-9999",
  facebook: "https://facebook.com/autoparts",
  instagram: "https://instagram.com/autoparts",
  youtube: "https://youtube.com/autoparts",
  primaryColor: "#dc2626",
  emailNotifications: true,
  stockAlerts: true,
  newMessageAlerts: true,
  weeklyReport: false,
  maintenanceMode: false,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AdminSettings() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await api.getSettings();
        if (data && Object.keys(data).length > 0) {
          setSettings(data);
        }
      } catch (e) {
        console.error("Error loading settings:", e);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error("Error saving settings:", e);
      alert("Erro ao salvar configuracoes.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "general", label: "Geral", icon: Store },
    { id: "social", label: "Redes Sociais", icon: Globe },
    { id: "pricing", label: "Precos", icon: DollarSign },
    { id: "notifications", label: "Notificacoes", icon: Bell },
    { id: "appearance", label: "Aparencia", icon: Palette },
    { id: "security", label: "Seguranca", icon: Shield },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-gray-800" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            Configuracoes
          </h2>
          <p className="text-gray-400 flex items-center gap-1.5" style={{ fontSize: "0.85rem" }}>
            <Database className="w-3.5 h-3.5" />
            Dados salvos no Supabase
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all disabled:opacity-50 ${
            saved ? "bg-green-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"
          }`}
          style={{ fontSize: "0.85rem", fontWeight: 500 }}
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          ) : saved ? (
            <><Check className="w-4 h-4" /> Salvo no Supabase!</>
          ) : (
            <><Save className="w-4 h-4" /> Salvar Alteracoes</>
          )}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Sidebar Tabs */}
        <div className="lg:w-56 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-2 flex lg:flex-col gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? "bg-red-50 text-red-600" : "text-gray-600 hover:bg-gray-50"
                }`}
                style={{ fontSize: "0.85rem", fontWeight: activeTab === tab.id ? 500 : 400 }}>
                <tab.icon className="w-4 h-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
          {activeTab === "general" && (
            <div className="space-y-5">
              <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
                Informacoes Gerais
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Nome da Loja</label>
                  <input type="text" value={settings.storeName}
                    onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Subtitulo</label>
                  <input type="text" value={settings.storeSubtitle}
                    onChange={(e) => setSettings({ ...settings, storeSubtitle: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>E-mail</label>
                  <input type="email" value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Telefone</label>
                  <input type="text" value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Endereco</label>
                  <input type="text" value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>CNPJ</label>
                  <input type="text" value={settings.cnpj}
                    onChange={(e) => setSettings({ ...settings, cnpj: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>CEP</label>
                  <input type="text" value={settings.cep}
                    onChange={(e) => setSettings({ ...settings, cep: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
              </div>

              <h3 className="text-gray-800 pb-3 border-b border-gray-100 pt-3" style={{ fontSize: "1rem", fontWeight: 600 }}>Comercial</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Frete gratis a partir de (R$)</label>
                  <input type="text" value={settings.freeShippingMin}
                    onChange={(e) => setSettings({ ...settings, freeShippingMin: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Max. Parcelas</label>
                  <input type="text" value={settings.maxInstallments}
                    onChange={(e) => setSettings({ ...settings, maxInstallments: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>WhatsApp</label>
                  <input type="text" value={settings.whatsapp}
                    onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
              </div>

              <h3 className="text-gray-800 pb-3 border-b border-gray-100 pt-3" style={{ fontSize: "1rem", fontWeight: 600 }}>Horario de Funcionamento</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Seg a Sex</label>
                  <input type="text" value={settings.workdaysHours}
                    onChange={(e) => setSettings({ ...settings, workdaysHours: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Sabado</label>
                  <input type="text" value={settings.saturdayHours}
                    onChange={(e) => setSettings({ ...settings, saturdayHours: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "social" && (
            <div className="space-y-5">
              <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>Redes Sociais</h3>
              <div className="space-y-4">
                {([
                  { label: "Facebook", key: "facebook" as const },
                  { label: "Instagram", key: "instagram" as const },
                  { label: "YouTube", key: "youtube" as const },
                ]).map((social) => (
                  <div key={social.key}>
                    <label className="block text-gray-600 mb-1" style={{ fontSize: "0.8rem", fontWeight: 500 }}>{social.label}</label>
                    <input type="url" value={settings[social.key]}
                      onChange={(e) => setSettings({ ...settings, [social.key]: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
                      style={{ fontSize: "0.85rem" }} placeholder={`https://${social.key}.com/...`} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "pricing" && <PricingConfigSection />}

          {activeTab === "notifications" && (
            <div className="space-y-5">
              <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>Preferencias de Notificacao</h3>
              <div className="space-y-4">
                {([
                  { label: "Notificacoes por E-mail", desc: "Receba notificacoes de novos orcamentos por e-mail", key: "emailNotifications" as const },
                  { label: "Alertas de Estoque", desc: "Receba alertas quando um produto estiver com estoque baixo", key: "stockAlerts" as const },
                  { label: "Novas Mensagens", desc: "Receba alerta quando uma nova mensagem de contato chegar", key: "newMessageAlerts" as const },
                  { label: "Relatorio Semanal", desc: "Receba um resumo semanal de atividades do site", key: "weeklyReport" as const },
                ]).map((notif) => (
                  <div key={notif.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>{notif.label}</p>
                      <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>{notif.desc}</p>
                    </div>
                    <button onClick={() => setSettings({ ...settings, [notif.key]: !settings[notif.key] })}
                      className={`relative w-11 h-6 rounded-full transition-colors ${settings[notif.key] ? "bg-red-600" : "bg-gray-300"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[notif.key] ? "translate-x-5.5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-6">
              {/* Logo Upload */}
              <LogoUploadSection />

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Footer Logo Upload */}
              <FooterLogoUploadSection />

              {/* Divider */}
              <div className="border-t border-gray-100" />

              {/* Cor Primaria */}
              <div>
                <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>Cores</h3>
                <div className="mt-4">
                  <label className="block text-gray-600 mb-2" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Cor Primaria</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={settings.primaryColor}
                      onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer" />
                    <input type="text" value={settings.primaryColor}
                      onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                      className="w-32 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 outline-none focus:border-red-500 transition-all" style={{ fontSize: "0.85rem" }} />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-gray-600 mb-2" style={{ fontSize: "0.8rem", fontWeight: 500 }}>Paleta de Cores Atual</label>
                  <div className="flex gap-3">
                    {[
                      { color: "#dc2626", label: "Vermelho" },
                      { color: "#ffffff", label: "Branco" },
                      { color: "#6b7280", label: "Cinza" },
                      { color: "#111827", label: "Escuro" },
                    ].map((c) => (
                      <div key={c.color} className="flex flex-col items-center gap-1.5">
                        <div className="w-12 h-12 rounded-lg border border-gray-200 shadow-sm" style={{ backgroundColor: c.color }} />
                        <span className="text-gray-500" style={{ fontSize: "0.7rem" }}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-5">
              <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>Seguranca e Manutencao</h3>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Modo de Manutencao</p>
                  <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>Ativa uma pagina de manutencao para visitantes</p>
                </div>
                <button onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${settings.maintenanceMode ? "bg-red-600" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.maintenanceMode ? "translate-x-5.5" : "translate-x-0.5"}`} />
                </button>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <p className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Alterar Senha de Admin</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="password" placeholder="Senha atual"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-white outline-none focus:border-red-500 transition-all" style={{ fontSize: "0.85rem" }} />
                  <input type="password" placeholder="Nova senha"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-white outline-none focus:border-red-500 transition-all" style={{ fontSize: "0.85rem" }} />
                </div>
                <button className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors" style={{ fontSize: "0.8rem" }}>
                  Atualizar Senha
                </button>
              </div>

              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-red-700 mb-1" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Zona Perigosa</p>
                <p className="text-red-500 mb-3" style={{ fontSize: "0.8rem" }}>Acoes irreversiveis. Tenha cuidado.</p>
                <div className="flex gap-2">
                  <button className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-100 transition-colors" style={{ fontSize: "0.8rem" }}>
                    Limpar Cache
                  </button>
                  <button className="px-3 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-100 transition-colors" style={{ fontSize: "0.8rem" }}>
                    Resetar Configuracoes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Logo Upload Section (self-contained)
   ═══════════════════════════════════════════════ */

function LogoUploadSection() {
  const [logo, setLogo] = useState<LogoMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLogo = useCallback(async () => {
    try {
      const data = await api.getLogo();
      setLogo(data);
    } catch (e) {
      console.error("Error loading logo:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogo();
  }, [loadLogo]);

  const getToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Faca login novamente.");
    return token;
  };

  const handleFile = async (file: File) => {
    setError("");
    setSuccess("");

    // Validate type
    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      setError("Formato nao suportado. Use AVIF, PNG, JPEG, WebP ou SVG.");
      return;
    }

    // Validate size
    if (file.size > 2 * 1024 * 1024) {
      setError("Arquivo muito grande. Maximo: 2MB.");
      return;
    }

    // Generate preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setUploading(true);
    try {
      const token = await getToken();
      const result = await api.uploadLogo(file, token);
      setLogo({ hasLogo: true, url: result.url, filename: result.filename, contentType: result.contentType, size: result.size, uploadedAt: result.uploadedAt });
      setSuccess("Logo enviado com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao enviar logo.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const token = await getToken();
      await api.deleteLogo(token);
      setLogo({ hasLogo: false, url: null });
      setPreviewUrl(null);
      setSuccess("Logo removido.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao remover logo.");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset input so same file can be selected again
    e.target.value = "";
  };

  const displayUrl = previewUrl || (logo?.hasLogo && logo?.url ? logo.url : null);

  return (
    <div>
      <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
        Logo do Site
      </h3>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5">
        {/* Upload area */}
        <div>
          <p className="text-gray-500 mb-3" style={{ fontSize: "0.82rem" }}>
            Envie o logo do site no formato <strong>AVIF</strong> (recomendado), PNG, JPEG, WebP ou SVG.
            Tamanho maximo: 2MB. O logo sera exibido no header de todas as paginas.
          </p>

          {/* Drag-and-drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? "border-red-400 bg-red-50/60"
                : "border-gray-200 hover:border-red-300 hover:bg-red-50/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".avif,.png,.jpg,.jpeg,.webp,.svg"
              onChange={onFileChange}
              className="hidden"
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Enviando logo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="bg-red-50 rounded-full p-3">
                  <Upload className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                    Arraste o arquivo ou <span className="text-red-600 underline">clique para selecionar</span>
                  </p>
                  <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.75rem" }}>
                    AVIF, PNG, JPEG, WebP ou SVG - max. 2MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <FileWarning className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{success}</p>
            </div>
          )}

          {/* File info */}
          {logo?.hasLogo && logo.filename && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-white border border-gray-200 rounded-lg p-2 shrink-0">
                    <ImageIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-gray-700 truncate" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                      {logo.filename}
                    </p>
                    <div className="flex items-center gap-2 text-gray-400" style={{ fontSize: "0.72rem" }}>
                      {logo.size && <span>{formatFileSize(logo.size)}</span>}
                      {logo.contentType && (
                        <>
                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                          <span>{logo.contentType.replace("image/", "").toUpperCase()}</span>
                        </>
                      )}
                      {logo.uploadedAt && (
                        <>
                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                          <span>{new Date(logo.uploadedAt).toLocaleDateString("pt-BR")}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete button */}
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-2.5 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-3"
                    title="Remover logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div>
          <p className="text-gray-500 mb-2" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
            Pre-visualizacao
          </p>
          <div className="border border-gray-200 rounded-xl bg-gray-50/50 p-4 flex flex-col items-center justify-center min-h-[180px]">
            {loading ? (
              <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
            ) : displayUrl ? (
              <div className="flex flex-col items-center gap-3 w-full">
                {/* Mock header bar */}
                <div className="w-full bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3 shadow-sm">
                  <img
                    src={displayUrl}
                    alt="Logo preview"
                    className="h-10 w-auto max-w-[140px] object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="flex-1 h-2 bg-gray-100 rounded-full" />
                  <div className="w-6 h-2 bg-gray-100 rounded-full" />
                </div>
                <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>
                  Simulacao do header
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300">
                <ImageIcon className="w-10 h-10" />
                <p style={{ fontSize: "0.78rem" }}>Nenhum logo enviado</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Footer Logo Upload Section (self-contained)
   ═══════════════════════════════════════════════ */

function FooterLogoUploadSection() {
  const [logo, setLogo] = useState<LogoMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLogo = useCallback(async () => {
    try {
      const data = await api.getFooterLogo();
      setLogo(data);
    } catch (e) {
      console.error("Error loading footer logo:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogo();
  }, [loadLogo]);

  const getToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Faca login novamente.");
    return token;
  };

  const handleFile = async (file: File) => {
    setError("");
    setSuccess("");

    // Validate type
    const validTypes = ["image/avif", "image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      setError("Formato nao suportado. Use AVIF, PNG, JPEG, WebP ou SVG.");
      return;
    }

    // Validate size
    if (file.size > 2 * 1024 * 1024) {
      setError("Arquivo muito grande. Maximo: 2MB.");
      return;
    }

    // Generate preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setUploading(true);
    try {
      const token = await getToken();
      const result = await api.uploadFooterLogo(file, token);
      setLogo({ hasLogo: true, url: result.url, filename: result.filename, contentType: result.contentType, size: result.size, uploadedAt: result.uploadedAt });
      setSuccess("Logo do rodape enviado com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao enviar logo do rodape.");
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const token = await getToken();
      await api.deleteFooterLogo(token);
      setLogo({ hasLogo: false, url: null });
      setPreviewUrl(null);
      setSuccess("Logo do rodape removido.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao remover logo do rodape.");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => setDragOver(false);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset input so same file can be selected again
    e.target.value = "";
  };

  const displayUrl = previewUrl || (logo?.hasLogo && logo?.url ? logo.url : null);

  return (
    <div>
      <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
        Logo do Rodape
      </h3>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5">
        {/* Upload area */}
        <div>
          <p className="text-gray-500 mb-3" style={{ fontSize: "0.82rem" }}>
            Envie o logo do rodape no formato <strong>AVIF</strong> (recomendado), PNG, JPEG, WebP ou SVG.
            Tamanho maximo: 2MB. O logo sera exibido no rodape de todas as paginas.
          </p>

          {/* Drag-and-drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? "border-red-400 bg-red-50/60"
                : "border-gray-200 hover:border-red-300 hover:bg-red-50/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".avif,.png,.jpg,.jpeg,.webp,.svg"
              onChange={onFileChange}
              className="hidden"
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                <p className="text-gray-500" style={{ fontSize: "0.85rem" }}>Enviando logo do rodape...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="bg-red-50 rounded-full p-3">
                  <Upload className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-gray-700" style={{ fontSize: "0.88rem", fontWeight: 500 }}>
                    Arraste o arquivo ou <span className="text-red-600 underline">clique para selecionar</span>
                  </p>
                  <p className="text-gray-400 mt-0.5" style={{ fontSize: "0.75rem" }}>
                    AVIF, PNG, JPEG, WebP ou SVG - max. 2MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <FileWarning className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-red-600" style={{ fontSize: "0.82rem" }}>{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
              <Check className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-green-700" style={{ fontSize: "0.82rem" }}>{success}</p>
            </div>
          )}

          {/* File info */}
          {logo?.hasLogo && logo.filename && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="bg-white border border-gray-200 rounded-lg p-2 shrink-0">
                    <ImageIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-gray-700 truncate" style={{ fontSize: "0.82rem", fontWeight: 500 }}>
                      {logo.filename}
                    </p>
                    <div className="flex items-center gap-2 text-gray-400" style={{ fontSize: "0.72rem" }}>
                      {logo.size && <span>{formatFileSize(logo.size)}</span>}
                      {logo.contentType && (
                        <>
                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                          <span>{logo.contentType.replace("image/", "").toUpperCase()}</span>
                        </>
                      )}
                      {logo.uploadedAt && (
                        <>
                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                          <span>{new Date(logo.uploadedAt).toLocaleDateString("pt-BR")}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete button */}
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-2.5 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirmar"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-3"
                    title="Remover logo do rodape"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div>
          <p className="text-gray-500 mb-2" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
            Pre-visualizacao
          </p>
          <div className="border border-gray-200 rounded-xl bg-gray-50/50 p-4 flex flex-col items-center justify-center min-h-[180px]">
            {loading ? (
              <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
            ) : displayUrl ? (
              <div className="flex flex-col items-center gap-3 w-full">
                {/* Mock footer bar */}
                <div className="w-full bg-gray-900 rounded-lg p-4 flex items-center gap-3 shadow-sm">
                  <img
                    src={displayUrl}
                    alt="Logo rodape preview"
                    className="h-14 w-auto max-w-[160px] object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-1.5 bg-gray-700 rounded-full w-3/4" />
                    <div className="h-1.5 bg-gray-700 rounded-full w-1/2" />
                  </div>
                </div>
                <p className="text-gray-400" style={{ fontSize: "0.68rem" }}>
                  Simulacao do rodape
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300">
                <ImageIcon className="w-10 h-10" />
                <p style={{ fontSize: "0.78rem" }}>Nenhum logo enviado</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Pricing Config Section (self-contained)
   ═══════════════════════════════════════════════ */

function PricingConfigSection() {
  const [tier, setTier] = useState<"v1" | "v2" | "v3">("v2");
  const [showPrice, setShowPrice] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [testSku, setTestSku] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);

  const [customSku, setCustomSku] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customSaving, setCustomSaving] = useState(false);
  const [customMsg, setCustomMsg] = useState("");

  // Custom prices list
  const [customPrices, setCustomPrices] = useState<api.CustomPriceEntry[]>([]);
  const [customPricesLoading, setCustomPricesLoading] = useState(false);
  const [customPricesLoaded, setCustomPricesLoaded] = useState(false);

  // Cache clearing
  const [cacheClearMsg, setCacheClearMsg] = useState("");
  const [cacheClearLoading, setCacheClearLoading] = useState(false);

  // List price mapping
  const [listMappingV1, setListMappingV1] = useState("");
  const [listMappingV2, setListMappingV2] = useState("");
  const [listMappingV3, setListMappingV3] = useState("");
  const [sigeLists, setSigeLists] = useState<any[]>([]);
  const [sigeListsLoading, setSigeListsLoading] = useState(false);
  const [sigeListsLoaded, setSigeListsLoaded] = useState(false);

  useEffect(() => {
    api.getPriceConfig()
      .then((cfg: any) => {
        setTier(cfg.tier || "v2");
        setShowPrice(cfg.showPrice !== false);
        if (cfg.listPriceMapping) {
          setListMappingV1(cfg.listPriceMapping.v1 || "");
          setListMappingV2(cfg.listPriceMapping.v2 || "");
          setListMappingV3(cfg.listPriceMapping.v3 || "");
        }
      })
      .catch((e: any) => console.error("Error loading price config:", e))
      .finally(() => setLoading(false));
  }, []);

  const getToken = async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sessao expirada.");
    return token;
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const listPriceMapping: Record<string, string> = {};
      if (listMappingV1.trim()) listPriceMapping.v1 = listMappingV1.trim();
      if (listMappingV2.trim()) listPriceMapping.v2 = listMappingV2.trim();
      if (listMappingV3.trim()) listPriceMapping.v3 = listMappingV3.trim();
      await api.savePriceConfig({ tier, showPrice, listPriceMapping } as any, token);
      setSuccess("Configuracao salva!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e: any) {
      setError(e.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testSku.trim()) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const data = await api.getProductPrice(testSku.trim());
      setTestResult(data);
    } catch (e: any) {
      setTestResult({ error: e.message });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSetCustom = async () => {
    if (!customSku.trim() || !customPrice.trim()) return;
    const price = parseFloat(customPrice.replace(",", "."));
    if (isNaN(price) || price < 0) { setCustomMsg("Preco invalido."); return; }
    setCustomSaving(true);
    setCustomMsg("");
    try {
      const token = await getToken();
      await api.setProductCustomPrice(customSku.trim(), price, token);
      setCustomMsg(`Preco R$${price.toFixed(2)} salvo para ${customSku.trim()}`);
      setCustomSku("");
      setCustomPrice("");
      // Refresh list if loaded
      if (customPricesLoaded) loadCustomPrices();
    } catch (e: any) {
      setCustomMsg(e.message || "Erro ao salvar.");
    } finally {
      setCustomSaving(false);
    }
  };

  const handleRemoveCustom = async (sku?: string) => {
    const targetSku = sku || customSku.trim();
    if (!targetSku) return;
    setCustomSaving(true);
    setCustomMsg("");
    try {
      const token = await getToken();
      await api.deleteProductCustomPrice(targetSku, token);
      setCustomMsg(`Preco personalizado removido para ${targetSku}`);
      if (customPricesLoaded) loadCustomPrices();
    } catch (e: any) {
      setCustomMsg(e.message || "Erro ao remover.");
    } finally {
      setCustomSaving(false);
    }
  };

  const loadCustomPrices = async () => {
    setCustomPricesLoading(true);
    try {
      const token = await getToken();
      const result = await api.getCustomPrices(token);
      setCustomPrices(result.customs || []);
      setCustomPricesLoaded(true);
    } catch (e: any) {
      console.error("Error loading custom prices:", e);
    } finally {
      setCustomPricesLoading(false);
    }
  };

  const handleClearCache = async () => {
    setCacheClearLoading(true);
    setCacheClearMsg("");
    try {
      const token = await getToken();
      const result = await api.clearPriceCache(token);
      setCacheClearMsg(result.message || `${result.cleared} caches removidos.`);
      setTimeout(() => setCacheClearMsg(""), 5000);
    } catch (e: any) {
      setCacheClearMsg(e.message || "Erro ao limpar cache.");
    } finally {
      setCacheClearLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-red-600 animate-spin" />
      </div>
    );
  }

  const tiers = [
    { id: "v1" as const, label: "Tabela V1", desc: "Primeira lista de preco mapeada (ou auto-atribuida)" },
    { id: "v2" as const, label: "Tabela V2", desc: "Segunda lista de preco mapeada (ou auto-atribuida) — padrao" },
    { id: "v3" as const, label: "Tabela V3", desc: "Terceira lista de preco mapeada (ou auto-atribuida)" },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Tabela de Precos ─── */}
      <div>
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Tabela de Precos do SIGE
        </h3>
        <p className="text-gray-500 mt-3 mb-4" style={{ fontSize: "0.82rem" }}>
          Selecione qual tabela de preco do SIGE sera exibida no site. O padrao e V2.
        </p>
        <div className="space-y-2">
          {tiers.map((t) => (
            <label key={t.id} className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
              tier === t.id ? "border-red-500 bg-red-50/60" : "border-gray-200 hover:border-red-200 bg-white"
            }`}>
              <input type="radio" name="priceTier" value={t.id} checked={tier === t.id}
                onChange={() => setTier(t.id)} className="accent-red-600 w-4 h-4" />
              <div>
                <p className="text-gray-800" style={{ fontSize: "0.88rem", fontWeight: 600 }}>{t.label}</p>
                <p className="text-gray-400" style={{ fontSize: "0.75rem" }}>{t.desc}</p>
              </div>
              {t.id === "v2" && (
                <span className="ml-auto bg-red-100 text-red-600 px-2 py-0.5 rounded-full" style={{ fontSize: "0.65rem", fontWeight: 600 }}>PADRAO</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* ─── Exibir Precos Toggle ─── */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <p className="text-gray-700" style={{ fontSize: "0.9rem", fontWeight: 500 }}>Exibir precos no site</p>
          <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>Quando desativado, os precos nao aparecem no catalogo</p>
        </div>
        <button onClick={() => setShowPrice(!showPrice)}
          className={`relative w-11 h-6 rounded-full transition-colors ${showPrice ? "bg-red-600" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showPrice ? "translate-x-5.5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* ─── Mapeamento Lista de Precos SIGE ─── */}
      <div>
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Mapeamento de Listas de Preco
        </h3>
        <p className="text-gray-500 mt-3 mb-4" style={{ fontSize: "0.82rem" }}>
          Configure qual <code className="bg-gray-100 px-1 rounded">codLista</code> do SIGE corresponde a cada tabela (V1, V2, V3).
          Deixe em branco para auto-atribuir por ordem. Use a aba <strong>API SIGE &gt; Lista de Preco</strong> para descobrir as listas disponiveis.
        </p>

        {/* Load SIGE lists button */}
        <div className="mb-4">
          <button onClick={async () => {
            setSigeListsLoading(true);
            try {
              const token = await getToken();
              const data = await api.getSigeListPrices(token);
              const items = data?.dados || data?.data || (Array.isArray(data) ? data : []);
              setSigeLists(items);
              setSigeListsLoaded(true);
            } catch (e: any) {
              console.error("Error loading SIGE lists:", e);
              setSigeLists([]);
            } finally { setSigeListsLoading(false); }
          }} disabled={sigeListsLoading}
            className="flex items-center gap-2 px-3 py-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50 cursor-pointer"
            style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            {sigeListsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            {sigeListsLoading ? "Carregando..." : "Carregar Listas do SIGE"}
          </button>
        </div>

        {/* Show discovered SIGE lists */}
        {sigeListsLoaded && sigeLists.length > 0 && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-gray-600 mb-2" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
              {sigeLists.length} lista(s) encontrada(s) no SIGE:
            </p>
            <div className="flex flex-wrap gap-2">
              {sigeLists.map((lst: any, i: number) => (
                <span key={i} className="px-2 py-1 bg-white border border-gray-200 rounded text-gray-700 font-mono"
                  style={{ fontSize: "0.75rem" }}>
                  <strong>{lst.codLista}</strong>
                  {lst.descLista && <span className="text-gray-400 ml-1">— {lst.descLista}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {sigeListsLoaded && sigeLists.length === 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <p className="text-amber-700" style={{ fontSize: "0.78rem" }}>
              Nenhuma lista de preco encontrada no SIGE. Verifique se a conexao esta ativa.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "V1", value: listMappingV1, setter: setListMappingV1 },
            { label: "V2", value: listMappingV2, setter: setListMappingV2 },
            { label: "V3", value: listMappingV3, setter: setListMappingV3 },
          ].map(({ label, value, setter }) => (
            <div key={label}>
              <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                Tabela {label} → codLista
              </label>
              <input type="text" value={value} onChange={(e) => setter(e.target.value)}
                placeholder={`codLista para ${label}`}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
                style={{ fontSize: "0.82rem" }} />
            </div>
          ))}
        </div>
        <p className="text-gray-400 mt-2" style={{ fontSize: "0.72rem" }}>
          Exemplo: se suas listas no SIGE sao codLista=1, codLista=2, codLista=3, coloque "1", "2", "3" acima.
        </p>
      </div>

      {/* ─── Salvar + Limpar Cache ─── */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all disabled:opacity-50 ${
            success ? "bg-green-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"
          }`} style={{ fontSize: "0.85rem", fontWeight: 500 }}>
          {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>)
            : success ? (<><Check className="w-4 h-4" /> {success}</>)
            : (<><Save className="w-4 h-4" /> Salvar Configuracao</>)}
        </button>
        <button onClick={handleClearCache} disabled={cacheClearLoading}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          style={{ fontSize: "0.82rem", fontWeight: 500 }}>
          {cacheClearLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Limpar Cache de Precos
        </button>
        {error && <span className="text-red-500" style={{ fontSize: "0.8rem" }}>{error}</span>}
        {cacheClearMsg && <span className="text-green-600" style={{ fontSize: "0.8rem" }}>{cacheClearMsg}</span>}
      </div>

      <div className="border-t border-gray-100" />

      {/* ─── Preco Personalizado por Produto ─── */}
      <div>
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Preco Personalizado por Produto
        </h3>
        <p className="text-gray-500 mt-3 mb-4" style={{ fontSize: "0.82rem" }}>
          Define um preco fixo para um produto especifico, sobrescrevendo o valor do SIGE.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto_auto] gap-2 items-end">
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>SKU</label>
            <input type="text" value={customSku} onChange={(e) => setCustomSku(e.target.value)}
              placeholder="Ex: 12345-A"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <div>
            <label className="block text-gray-600 mb-1" style={{ fontSize: "0.78rem", fontWeight: 500 }}>Preco (R$)</label>
            <input type="text" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="29.90"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }} />
          </div>
          <button onClick={handleSetCustom} disabled={customSaving || !customSku.trim() || !customPrice.trim()}
            className="px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            {customSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
          </button>
          <button onClick={() => handleRemoveCustom()} disabled={customSaving || !customSku.trim()}
            className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            Remover
          </button>
        </div>
        {customMsg && <p className="mt-2 text-gray-600" style={{ fontSize: "0.8rem" }}>{customMsg}</p>}
      </div>

      {/* ─── Lista de Precos Personalizados ─── */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <h3 className="text-gray-800" style={{ fontSize: "1rem", fontWeight: 600 }}>
            Precos Personalizados Salvos
          </h3>
          <button onClick={loadCustomPrices} disabled={customPricesLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            style={{ fontSize: "0.78rem", fontWeight: 500 }}>
            {customPricesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            {customPricesLoaded ? "Atualizar" : "Carregar Lista"}
          </button>
        </div>

        {customPricesLoaded && (
          <div className="mt-3">
            {customPrices.length === 0 ? (
              <p className="text-gray-400 py-4 text-center" style={{ fontSize: "0.82rem" }}>
                Nenhum preco personalizado cadastrado.
              </p>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 text-gray-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>SKU</th>
                      <th className="text-right px-4 py-2.5 text-gray-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Preco</th>
                      <th className="text-center px-4 py-2.5 text-gray-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Data</th>
                      <th className="text-center px-4 py-2.5 text-gray-600" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customPrices.map((cp) => (
                      <tr key={cp.sku} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-gray-700" style={{ fontSize: "0.82rem" }}>{cp.sku}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-red-600" style={{ fontSize: "0.88rem", fontWeight: 700 }}>
                            R$ {Number(cp.price).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                            {cp.updatedAt ? new Date(cp.updatedAt).toLocaleDateString("pt-BR") : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => handleRemoveCustom(cp.sku)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Remover preco personalizado"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
                  <span className="text-gray-400" style={{ fontSize: "0.72rem" }}>
                    {customPrices.length} preco{customPrices.length !== 1 ? "s" : ""} personalizado{customPrices.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100" />

      {/* ─── Testar Preco ─── */}
      <div>
        <h3 className="text-gray-800 pb-3 border-b border-gray-100" style={{ fontSize: "1rem", fontWeight: 600 }}>
          Testar Preco de um Produto
        </h3>
        <p className="text-gray-500 mt-3 mb-4" style={{ fontSize: "0.82rem" }}>
          Verifique o preco retornado pelo SIGE para qualquer SKU. Mostra V1, V2, V3 e os campos detectados.
        </p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <input type="text" value={testSku} onChange={(e) => setTestSku(e.target.value)}
              placeholder="Digite o SKU"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 bg-gray-50 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all"
              style={{ fontSize: "0.85rem" }}
              onKeyDown={(e) => e.key === "Enter" && handleTest()} />
          </div>
          <button onClick={handleTest} disabled={testLoading || !testSku.trim()}
            className="px-5 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            style={{ fontSize: "0.82rem", fontWeight: 500 }}>
            {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Consultar"}
          </button>
        </div>
        {testResult && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
            {testResult.error && !testResult.found ? (
              <p className="text-red-500" style={{ fontSize: "0.82rem" }}>{testResult.error}</p>
            ) : (
              <div className="space-y-2">
                {/* Source badge */}
                <div className="flex items-center gap-3">
                  <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500, minWidth: 100 }}>Fonte:</span>
                  <span className={`px-2 py-0.5 rounded-full text-white ${testResult.source === "custom" ? "bg-amber-500" : testResult.source === "none" ? "bg-gray-400" : "bg-blue-500"}`} style={{ fontSize: "0.7rem", fontWeight: 600 }}>
                    {testResult.source === "custom" ? "PERSONALIZADO" : testResult.source === "none" ? "NAO DISPONIVEL" : `SIGE ${(testResult.tier || "").toUpperCase()}`}
                  </span>
                  {testResult.cached && (
                    <span className="bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded" style={{ fontSize: "0.65rem" }}>CACHE</span>
                  )}
                </div>

                {/* Price */}
                <div className="flex items-center gap-3">
                  <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500, minWidth: 100 }}>Preco Final:</span>
                  <span className={testResult.price !== null && testResult.price !== undefined ? "text-red-600" : "text-gray-400"} style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                    {testResult.price !== null && testResult.price !== undefined ? `R$ ${Number(testResult.price).toFixed(2)}` : "Sem preco"}
                  </span>
                </div>

                {/* V1, V2, V3 values */}
                {testResult.source !== "custom" && (
                  <div className="bg-white border border-gray-200 rounded-lg p-3 mt-2">
                    <p className="text-gray-600 mb-2" style={{ fontSize: "0.75rem", fontWeight: 600 }}>Tabelas de Preco SIGE:</p>
                    <div className="grid grid-cols-3 gap-3">
                      {(["v1", "v2", "v3"] as const).map((v) => {
                        const label = v.toUpperCase();
                        const val = testResult[v];
                        const isSelected = testResult.tier === v;
                        return (
                          <div key={v} className={`p-2.5 rounded-lg border-2 text-center ${
                            isSelected ? "border-red-500 bg-red-50" : "border-gray-100 bg-gray-50"
                          }`}>
                            <p className="text-gray-500" style={{ fontSize: "0.68rem", fontWeight: 600 }}>{label}</p>
                            <p className={isSelected ? "text-red-600" : "text-gray-700"} style={{ fontSize: "0.92rem", fontWeight: 700 }}>
                              {val !== null && val !== undefined ? `R$ ${Number(val).toFixed(2)}` : "—"}
                            </p>
                            {isSelected && (
                              <span className="text-red-500" style={{ fontSize: "0.6rem", fontWeight: 600 }}>SELECIONADA</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {testResult.base !== null && testResult.base !== undefined && (
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                        <span className="text-gray-500" style={{ fontSize: "0.75rem", fontWeight: 500 }}>Base:</span>
                        <span className="text-gray-700" style={{ fontSize: "0.85rem", fontWeight: 600 }}>R$ {Number(testResult.base).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* SIGE details */}
                {testResult.sigeId && (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500, minWidth: 100 }}>SIGE ID:</span>
                    <span className="text-gray-700 font-mono" style={{ fontSize: "0.82rem" }}>{testResult.sigeId}</span>
                  </div>
                )}
                {testResult.descricao && (
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500" style={{ fontSize: "0.78rem", fontWeight: 500, minWidth: 100 }}>Descricao:</span>
                    <span className="text-gray-700" style={{ fontSize: "0.82rem" }}>{testResult.descricao}</span>
                  </div>
                )}

                {/* Debug: price keys found */}
                {testResult._priceKeys && testResult._priceKeys.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-gray-500 mb-1" style={{ fontSize: "0.72rem", fontWeight: 600 }}>Campos de preco detectados no SIGE:</p>
                    <div className="flex flex-wrap gap-1">
                      {testResult._priceKeys.map((pk: string, i: number) => (
                        <span key={i} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono" style={{ fontSize: "0.68rem" }}>
                          {pk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Not found message */}
                {!testResult.found && testResult.source !== "none" && (
                  <p className="text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" style={{ fontSize: "0.8rem" }}>
                    Produto nao encontrado no SIGE ou sem preco definido nas tabelas V1/V2/V3.
                  </p>
                )}
                {testResult.source === "none" && testResult.error && (
                  <p className="text-amber-600 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" style={{ fontSize: "0.8rem" }}>
                    {testResult.error}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}