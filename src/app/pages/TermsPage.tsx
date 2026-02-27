import { Link } from "react-router";
import { Home, ChevronRight, FileText } from "lucide-react";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export function TermsPage() {
  useDocumentMeta({
    title: "Termos de Uso - Carretão Auto Peças",
    description: "Termos de Uso do site Carretão Auto Peças. Condições gerais para uso do site, compras e serviços.",
    ogTitle: "Termos de Uso - Carretão Auto Peças",
    canonical: window.location.origin + "/termos-de-uso",
  });

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-1.5 text-gray-500" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              Início
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Termos de Uso</span>
          </nav>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 lg:py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-red-50 rounded-xl p-3">
            <FileText className="w-7 h-7 text-red-600" />
          </div>
          <div>
            <h1 className="text-gray-900" style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.2 }}>
              Termos de Uso
            </h1>
            <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>
              Última atualização: 20 de fevereiro de 2026
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 space-y-8">
          <Section title="1. Aceitação dos Termos">
            <p>
              Ao acessar e utilizar o site da <strong>Carretão Auto Peças</strong> ("site"), você
              concorda com estes Termos de Uso. Se você não concordar com qualquer disposição,
              recomendamos que não utilize nossos serviços.
            </p>
          </Section>

          <Section title="2. Descrição dos Serviços">
            <p>
              O site oferece um catálogo online de peças automotivas, com funcionalidades de busca,
              cálculo de frete, carrinho de compras, pagamento online (PIX, Boleto e Mercado Pago) e
              acompanhamento de pedidos. Os serviços são destinados a pessoas físicas e jurídicas
              residentes no Brasil.
            </p>
          </Section>

          <Section title="3. Cadastro e Conta de Usuário">
            <ul className="list-disc pl-5 space-y-1">
              <li>Para realizar compras, é necessário criar uma conta com informações verídicas e atualizadas.</li>
              <li>Você é responsável por manter a confidencialidade de sua senha e por todas as atividades realizadas em sua conta.</li>
              <li>A Carretão Auto Peças reserva-se o direito de suspender ou cancelar contas que violem estes Termos.</li>
              <li>Você deve ter pelo menos 18 anos ou ser legalmente emancipado para utilizar nossos serviços.</li>
            </ul>
          </Section>

          <Section title="4. Produtos e Preços">
            <ul className="list-disc pl-5 space-y-1">
              <li>As imagens e descrições dos produtos são meramente ilustrativas. Podem ocorrer pequenas variações.</li>
              <li>Os preços exibidos no site podem ser alterados sem aviso prévio, mas pedidos já confirmados serão honrados pelo preço da compra.</li>
              <li>A disponibilidade de produtos está sujeita ao estoque. Caso um produto não esteja disponível após a compra, entraremos em contato para oferecer alternativas ou reembolso integral.</li>
              <li>Descontos promocionais não são cumulativos, salvo indicação expressa em contrário.</li>
            </ul>
          </Section>

          <Section title="5. Pedidos e Pagamento">
            <ul className="list-disc pl-5 space-y-1">
              <li>A confirmação do pedido só ocorre após a aprovação do pagamento pelo processador financeiro.</li>
              <li>Aceitamos pagamento via PIX, Boleto Bancário e Mercado Pago (cartão de crédito/débito).</li>
              <li>Pagamentos via PIX e boleto possuem prazos de vencimento. Pedidos não pagos dentro do prazo serão automaticamente cancelados.</li>
              <li>A nota fiscal será emitida conforme legislação vigente e enviada ao e-mail cadastrado.</li>
            </ul>
          </Section>

          <Section title="6. Entrega e Frete">
            <ul className="list-disc pl-5 space-y-1">
              <li>O prazo de entrega é estimado e pode variar conforme a região e a transportadora selecionada.</li>
              <li>O frete é calculado com base no CEP de destino, peso e dimensões do produto.</li>
              <li>A Carretão Auto Peças não se responsabiliza por atrasos causados por eventos de força maior (greves, desastres naturais, etc.).</li>
              <li>O recebedor deve conferir a mercadoria no ato da entrega e relatar eventuais avarias imediatamente.</li>
            </ul>
          </Section>

          <Section title="7. Trocas e Devoluções">
            <ul className="list-disc pl-5 space-y-1">
              <li>O consumidor tem direito de arrependimento no prazo de <strong>7 dias corridos</strong> a partir do recebimento do produto, conforme o Art. 49 do Código de Defesa do Consumidor (CDC).</li>
              <li>O produto deve ser devolvido em sua embalagem original, sem sinais de uso ou instalação.</li>
              <li>Produtos com defeito de fábrica podem ser trocados em até <strong>30 dias</strong> (produtos não duráveis) ou <strong>90 dias</strong> (produtos duráveis) a partir do recebimento.</li>
              <li>Para solicitar troca ou devolução, entre em contato pelo 0800 643 1170 ou pelo formulário de contato do site.</li>
            </ul>
          </Section>

          <Section title="8. Propriedade Intelectual">
            <p>
              Todo o conteúdo do site — incluindo textos, imagens, logotipos, layout, código-fonte e
              marcas — é de propriedade da Carretão Auto Peças ou de seus licenciadores, protegido
              pela legislação brasileira de propriedade intelectual. É proibida a reprodução, cópia
              ou distribuição sem autorização expressa.
            </p>
          </Section>

          <Section title="9. Responsabilidades do Usuário">
            <p>O usuário compromete-se a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fornecer informações verídicas e atualizadas no cadastro e em pedidos</li>
              <li>Não utilizar o site para fins ilícitos ou que violem direitos de terceiros</li>
              <li>Não tentar acessar áreas restritas do site ou comprometer sua segurança</li>
              <li>Não utilizar robôs, scrapers ou outros meios automatizados para acessar o site sem autorização</li>
            </ul>
          </Section>

          <Section title="10. Limitação de Responsabilidade">
            <ul className="list-disc pl-5 space-y-1">
              <li>O site é fornecido "como está". Não garantimos disponibilidade ininterrupta ou ausência de erros.</li>
              <li>A Carretão Auto Peças não se responsabiliza por danos indiretos, incidentais ou consequenciais decorrentes do uso do site.</li>
              <li>Não nos responsabilizamos por conteúdo de sites de terceiros acessados por meio de links disponibilizados em nosso site.</li>
            </ul>
          </Section>

          <Section title="11. Privacidade e Proteção de Dados">
            <p>
              O tratamento de seus dados pessoais é regido por nossa{" "}
              <Link to="/politica-de-privacidade" className="text-red-600 hover:underline font-medium">
                Política de Privacidade
              </Link>
              , que é parte integrante destes Termos de Uso. Ao aceitar estes Termos, você também
              declara ter lido e compreendido nossa Política de Privacidade.
            </p>
          </Section>

          <Section title="12. Alterações nos Termos">
            <p>
              A Carretão Auto Peças pode alterar estes Termos de Uso a qualquer momento. As
              alterações entram em vigor na data de sua publicação no site. O uso continuado do site
              após a publicação das alterações constitui aceitação dos novos Termos.
            </p>
          </Section>

          <Section title="13. Legislação Aplicável e Foro">
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil, especialmente
              pelo Código de Defesa do Consumidor (Lei n.º 8.078/1990), Código Civil (Lei n.º
              10.406/2002), Marco Civil da Internet (Lei n.º 12.965/2014) e Lei Geral de Proteção
              de Dados (Lei n.º 13.709/2018). Fica eleito o foro da comarca de Maringá, Estado do
              Paraná, para resolver quaisquer controvérsias.
            </p>
          </Section>

          <Section title="14. Contato">
            <p>Para dúvidas sobre estes Termos, entre em contato:</p>
            <div className="bg-gray-50 rounded-xl p-5 mt-3 space-y-2">
              <p style={{ fontWeight: 600 }}>Carretão Auto Peças</p>
              <p>E-mail: contato@carretaoautopecas.com.br</p>
              <p>Telefone: 0800 643 1170</p>
              <p>WhatsApp: (44) 99733-0202</p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-gray-900 mb-3" style={{ fontSize: "1.15rem", fontWeight: 700 }}>
        {title}
      </h2>
      <div className="text-gray-600 space-y-3" style={{ fontSize: "0.88rem", lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}