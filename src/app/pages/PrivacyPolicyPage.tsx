import { Link } from "react-router";
import { Home, ChevronRight, Shield, Mail, Phone } from "lucide-react";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export function PrivacyPolicyPage() {
  useDocumentMeta({
    title: "Política de Privacidade - Carretão Auto Peças",
    description: "Política de Privacidade da Carretão Auto Peças. Saiba como coletamos, usamos e protegemos seus dados pessoais em conformidade com a LGPD.",
    ogTitle: "Política de Privacidade - Carretão Auto Peças",
    canonical: window.location.origin + "/politica-de-privacidade",
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
            <span className="text-gray-900 font-medium">Política de Privacidade</span>
          </nav>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 lg:py-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-red-50 rounded-xl p-3">
            <Shield className="w-7 h-7 text-red-600" />
          </div>
          <div>
            <h1 className="text-gray-900" style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.2 }}>
              Política de Privacidade
            </h1>
            <p className="text-gray-500" style={{ fontSize: "0.82rem" }}>
              Última atualização: 20 de fevereiro de 2026
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 space-y-8">
          {/* Section helper */}
          <Section title="1. Introdução">
            <p>
              A <strong>Carretão Auto Peças</strong> ("nós", "nosso" ou "empresa") valoriza a
              privacidade de seus clientes e usuários ("você" ou "titular"). Esta Política de
              Privacidade descreve como coletamos, usamos, armazenamos, compartilhamos e protegemos
              seus dados pessoais, em conformidade com a{" "}
              <strong>Lei Geral de Proteção de Dados (LGPD — Lei n.º 13.709/2018)</strong> e demais
              normas aplicáveis.
            </p>
            <p>
              Ao utilizar nosso site, você declara ter lido e compreendido esta Política. Caso não
              concorde com algum dos termos, recomendamos que não utilize nossos serviços.
            </p>
          </Section>

          <Section title="2. Dados Pessoais Coletados">
            <p>Podemos coletar os seguintes dados pessoais:</p>
            <SubSection title="2.1. Dados fornecidos por você">
              <ul className="list-disc pl-5 space-y-1">
                <li>Nome completo</li>
                <li>Endereço de e-mail</li>
                <li>Número de telefone/celular</li>
                <li>CPF ou CNPJ (para emissão de nota fiscal e faturamento)</li>
                <li>Endereço completo (para cálculo de frete e entrega)</li>
                <li>Dados de pagamento (processados por terceiros — PagHiper e Mercado Pago)</li>
                <li>Mensagens enviadas pelo formulário de contato</li>
              </ul>
            </SubSection>
            <SubSection title="2.2. Dados coletados automaticamente">
              <ul className="list-disc pl-5 space-y-1">
                <li>Endereço IP</li>
                <li>Tipo de navegador e sistema operacional</li>
                <li>Páginas visitadas e tempo de permanência</li>
                <li>Dados de navegação via Google Analytics 4 (GA4) — apenas com seu consentimento</li>
                <li>Cookies essenciais para funcionamento do site (sessão, carrinho de compras)</li>
              </ul>
            </SubSection>
          </Section>

          <Section title="3. Finalidades do Tratamento">
            <p>Seus dados pessoais são tratados para as seguintes finalidades:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Execução de contrato:</strong> processar pedidos, calcular frete, emitir nota fiscal, efetuar pagamento e entrega</li>
              <li><strong>Atendimento ao cliente:</strong> responder dúvidas, solicitações e reclamações</li>
              <li><strong>Obrigação legal:</strong> cumprimento de obrigações fiscais e regulatórias</li>
              <li><strong>Interesse legítimo:</strong> melhoria dos nossos serviços, prevenção de fraudes e segurança do site</li>
              <li><strong>Consentimento:</strong> envio de comunicações de marketing (quando autorizado), coleta de dados analíticos via GA4</li>
            </ul>
          </Section>

          <Section title="4. Bases Legais (Art. 7º, LGPD)">
            <p>O tratamento de seus dados pessoais fundamenta-se nas seguintes bases legais:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Consentimento</strong> (Art. 7º, I) — cookies analíticos e comunicações de marketing</li>
              <li><strong>Execução de contrato</strong> (Art. 7º, V) — realização e entrega de pedidos</li>
              <li><strong>Cumprimento de obrigação legal</strong> (Art. 7º, II) — obrigações fiscais e tributárias</li>
              <li><strong>Interesse legítimo</strong> (Art. 7º, IX) — segurança, prevenção de fraudes e melhoria dos serviços</li>
            </ul>
          </Section>

          <Section title="5. Compartilhamento de Dados">
            <p>Podemos compartilhar seus dados pessoais com:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Processadores de pagamento:</strong> PagHiper e Mercado Pago (para processar transações financeiras)</li>
              <li><strong>Transportadoras:</strong> para cálculo de frete e entrega de produtos</li>
              <li><strong>Sistema de gestão (ERP):</strong> SIGE Cloud, para gestão de estoque, pedidos e notas fiscais</li>
              <li><strong>Serviços de hospedagem e infraestrutura:</strong> Supabase (banco de dados e armazenamento)</li>
              <li><strong>Serviços de analítica:</strong> Google Analytics 4, somente com consentimento prévio</li>
              <li><strong>Autoridades públicas:</strong> quando exigido por lei ou decisão judicial</li>
            </ul>
            <p>
              Não vendemos, alugamos ou comercializamos seus dados pessoais com terceiros para
              fins de marketing.
            </p>
          </Section>

          <Section title="6. Cookies e Tecnologias de Rastreamento">
            <SubSection title="6.1. Cookies essenciais">
              <p>
                São necessários para o funcionamento básico do site, incluindo manutenção de sessão,
                carrinho de compras e preferências do usuário. Não requerem consentimento.
              </p>
            </SubSection>
            <SubSection title="6.2. Cookies analíticos (Google Analytics 4)">
              <p>
                Utilizamos o GA4 para entender como os usuários interagem com nosso site, melhorar a
                experiência de navegação e otimizar nossos serviços. Estes cookies só são ativados
                após seu consentimento explícito, através do banner de cookies exibido na sua primeira
                visita.
              </p>
            </SubSection>
            <SubSection title="6.3. Gerenciamento de cookies">
              <p>
                Você pode alterar suas preferências de cookies a qualquer momento clicando no link
                "Configurar Cookies" disponível no rodapé do site. Também é possível desativar
                cookies diretamente nas configurações do seu navegador.
              </p>
            </SubSection>
          </Section>

          <Section title="7. Retenção de Dados">
            <p>Seus dados pessoais serão armazenados pelo tempo necessário para cumprir as finalidades para as quais foram coletados:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Dados de compra e fiscal:</strong> 5 anos (conforme legislação tributária brasileira)</li>
              <li><strong>Dados de conta de usuário:</strong> enquanto a conta estiver ativa, ou por 2 anos após inatividade</li>
              <li><strong>Dados de contato (formulário):</strong> 1 ano após o atendimento</li>
              <li><strong>Dados de analítica:</strong> conforme política de retenção do Google Analytics (até 14 meses)</li>
            </ul>
          </Section>

          <Section title="8. Seus Direitos como Titular (Art. 18, LGPD)">
            <p>Você possui os seguintes direitos em relação aos seus dados pessoais:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Confirmação e acesso:</strong> confirmar a existência de tratamento e acessar seus dados</li>
              <li><strong>Correção:</strong> solicitar a correção de dados incompletos, inexatos ou desatualizados</li>
              <li><strong>Anonimização, bloqueio ou eliminação:</strong> de dados desnecessários, excessivos ou tratados em desconformidade</li>
              <li><strong>Portabilidade:</strong> solicitar a transferência de seus dados a outro fornecedor</li>
              <li><strong>Eliminação:</strong> solicitar a exclusão de dados pessoais tratados com base em consentimento</li>
              <li><strong>Informação sobre compartilhamento:</strong> saber com quais entidades seus dados foram compartilhados</li>
              <li><strong>Revogação do consentimento:</strong> revogar o consentimento a qualquer momento</li>
              <li><strong>Oposição:</strong> opor-se ao tratamento realizado com fundamento em interesse legítimo</li>
            </ul>
            <p>
              Para exercer seus direitos, entre em contato conosco pelos canais indicados na Seção 10.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-3">
              <p className="text-red-900" style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.3rem" }}>
                Formulário de Exercício de Direitos
              </p>
              <p className="text-red-800" style={{ fontSize: "0.85rem" }}>
                Utilize nosso{" "}
                <Link to="/exercicio-de-direitos" className="text-red-600 font-semibold underline hover:text-red-700">
                  formulário online de exercício de direitos LGPD
                </Link>{" "}
                para registrar sua solicitação de forma rápida e acompanhar o andamento pelo número de protocolo.
              </p>
            </div>
          </Section>

          <Section title="9. Segurança dos Dados">
            <p>
              Adotamos medidas técnicas e administrativas aptas a proteger seus dados pessoais contra
              acessos não autorizados, destruição, perda, alteração ou qualquer forma de tratamento
              inadequado ou ilícito, incluindo:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Criptografia de dados em trânsito (HTTPS/TLS)</li>
              <li>Controle de acesso restrito a dados pessoais</li>
              <li>Monitoramento e auditoria de acessos</li>
              <li>Armazenamento seguro em infraestrutura de nuvem com certificações de segurança</li>
              <li>Processamento de pagamentos exclusivamente por parceiros certificados (PCI-DSS)</li>
            </ul>
          </Section>

          <Section title="10. Contato e Encarregado de Dados (DPO)">
            <p>
              Para dúvidas, solicitações ou exercício de seus direitos previstos na LGPD, entre em
              contato com nosso Encarregado de Proteção de Dados ou utilize o{" "}
              <Link to="/exercicio-de-direitos" className="text-red-600 font-semibold underline hover:text-red-700">
                formulário de exercício de direitos
              </Link>:
            </p>
            <div className="bg-gray-50 rounded-xl p-5 mt-3 space-y-2">
              <p style={{ fontWeight: 600 }}>Carretão Auto Peças — Encarregado de Dados (DPO)</p>
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-4 h-4 text-red-500" />
                <a href="mailto:privacidade@carretaoautopecas.com.br" className="text-red-600 hover:underline">
                  privacidade@carretaoautopecas.com.br
                </a>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="w-4 h-4 text-red-500" />
                <span>0800 643 1170</span>
              </div>
            </div>
            <p className="mt-3">
              Responderemos sua solicitação em até <strong>15 dias úteis</strong>, conforme
              estabelecido pela LGPD.
            </p>
          </Section>

          <Section title="11. Transferência Internacional de Dados">
            <p>
              Alguns de nossos provedores de serviços (como Supabase e Google) podem processar dados
              em servidores localizados fora do Brasil. Nesses casos, garantimos que a transferência
              ocorra de acordo com as disposições da LGPD (Art. 33), utilizando cláusulas contratuais
              padrão e verificando que o país de destino oferece nível adequado de proteção de dados.
            </p>
          </Section>

          <Section title="12. Alterações nesta Política">
            <p>
              Esta Política de Privacidade pode ser atualizada periodicamente para refletir mudanças
              em nossas práticas ou na legislação aplicável. A data da última atualização será sempre
              indicada no topo desta página. Recomendamos que você revise esta página regularmente.
            </p>
          </Section>

          <Section title="13. Legislação Aplicável e Foro">
            <p>
              Esta Política é regida pelas leis da República Federativa do Brasil. Para resolver
              qualquer controvérsia decorrente desta Política, fica eleito o foro da comarca de
              Maringá, Estado do Paraná, com exclusão de qualquer outro, por mais privilegiado que
              seja.
            </p>
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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="text-gray-800 mb-1.5" style={{ fontSize: "0.92rem", fontWeight: 600 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}