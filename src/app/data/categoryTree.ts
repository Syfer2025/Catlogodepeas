// ─── Category Tree Data (Parent → Children → optional Grandchildren) ───

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  children?: CategoryNode[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let _idCounter = 1;
function nextId(): string {
  return `cat_${_idCounter++}`;
}

function node(name: string, children?: CategoryNode[]): CategoryNode {
  return {
    id: nextId(),
    name,
    slug: slugify(name),
    ...(children && children.length > 0 ? { children } : {}),
  };
}

function leaves(...names: string[]): CategoryNode[] {
  return names.map((n) => node(n));
}

export const defaultCategoryTree: CategoryNode[] = [
  node("Acessorios Externos e Esteticos", [
    ...leaves(
      "Acabamento", "Arco de Lona", "Buzinas", "Caixa de Cozinha", "Calha de Porta",
      "Cinta de Tanque", "Cintas", "Climatizadores", "Defletor", "Elastico",
      "Emblemas", "Estribo", "Fechadura Cabine", "Gerador", "Grade Frontal",
      "Lona Cobertura", "Macanetas", "Mangueira Flexivel", "Mola Grade",
      "Outros Acessorios Externos", "Palheta", "Para-choque", "Pino Fueiro",
      "Ponteiras", "Puxador de Grade", "Reservatorio de Agua", "Reservatorio de Ar",
      "Reservatorio Para-brisa", "Retrovisores", "Saia Traseira", "Sirenes",
      "Sobre Tampa", "Spoilers", "Tampa Cubo", "Tampa Fueiro", "Tampa Tira Fina",
      "Tampa Vigueta", "Tapa Barro", "Tapa Sol", "Tela da Grade Frontal",
      "Tira Fina", "Tomada Eletrica", "Trava de Capo", "Vidro Refil de Retrovisor"
    ),
  ]),
  node("Cabine e Acessorios de Interior", [
    ...leaves(
      "Alavanca", "Aplique Macaneta", "Ar-Condicionado", "Aranha Assoalho",
      "Botao de Vidro Eletrico", "Geladeiras", "Painel De Led", "Radio Px",
      "Tacografo", "Catracas"
    ),
  ]),
  node("Componentes de Fixacao e Diversos", [
    ...leaves(
      "Abracadeiras", "Arruela", "Bica", "Corrente Trava Tampa", "Correntes",
      "Cruzeta", "Dobradicas", "Eixos", "Insert Kit Fixacao", "Parafusos de Fixacao",
      "Porcas", "Presilha Corrente", "Presilha do Fueiro", "Presilhas"
    ),
    node("Suportes Diversos", [
      ...leaves("Botijao", "Estepe", "Placa", "Protetor", "Universal"),
    ]),
    ...leaves(
      "Tampa Bateria", "Tampa de Tanque", "Trava Alfinete", "Travas",
      "Tubos Flexivel e Nylon"
    ),
  ]),
  node("Componentes de Suspensao", [
    ...leaves(
      "Algema", "Amortecedor", "Anel Pista", "Anel Vedacao Pino Molejo",
      "Arruela Pino Mola", "Balanca", "Barra de Direcao", "Barra Reacao",
      "Batente Mola", "Batente Suspensao", "Bolsa de Ar", "Bucha Amortecedor",
      "Bucha Balanca", "Bucha Barra", "Bucha Braco Tensor", "Bucha Cabine",
      "Bucha Eixo", "Bucha Haste", "Bucha Mola", "Bucha Tirante",
      "Calco Para Levantar Molejo", "Calco Separador Feixe", "Cavalete da Haste",
      "Coxim da Suspensao", "Deslizante", "Grampo de Mola", "Haste Reacao",
      "Luva Olhar", "Mancal", "Mola de Borracha", "Molas", "Reparo Haste",
      "Retentor", "Suporte Suspensao", "Tirante"
    ),
  ]),
  node("Engates e Componentes de Reboque", [
    ...leaves(
      "Componentes 5a Roda", "Corrente de Engate", "Engate G Dobradica",
      "Engate Automatico", "Engate Corrente", "Engate Reboque", "Engates Rapidos",
      "Flange", "Haste de Ponteira", "Mesa 5a Roda", "Pino Rei", "Protetor Deslizante"
    ),
  ]),
  node("Ferramentas e Equipamentos de Manutencao", [
    ...leaves(
      "Caixa de Ferramentas", "Chave de Impacto", "Chave de Roda", "Espatula Pneu",
      "Lanterna Inspecao", "Macaco Pneumatico", "Martelo", "Medidor Nivel de Direcao",
      "Pistola de Ar", "Soquete de Impacto"
    ),
  ]),
  node("Filtros e Filtragem", [
    node("Filtro Caixa de Cambio Scania e Volvo"),
    node("Filtro Combustivel", [
      ...leaves("DAF", "Ford", "Iveco", "MAN", "MBB", "Scania", "Volkswagen", "Volvo"),
    ]),
    node("Filtro de Ar"),
    node("Filtro de Oleo"),
    node("Filtro Polen Cabine Scania"),
    node("Filtro Racor"),
    node("Filtro Tanque Ureia Ford"),
    node("Secador de Ar"),
  ]),
  node("Iluminacao e Sinalizacao", [
    node("Chicotes"),
    node("Faixa Refletiva"),
    node("Farois", [
      ...leaves(
        "DAF", "Facchini", "Ford", "Guerra", "Iveco", "Librelato", "MAN",
        "Mercedes-Benz", "NOMA", "Randon", "Rodotecnica", "Scania", "Volkswagen", "Volvo"
      ),
    ]),
    ...leaves(
      "Lampadas", "Lanternas", "Lentes", "Sinaleira", "Suporte de Lanterna",
      "Suporte Sinaleira", "Triangulo Refletor"
    ),
  ]),
  node("Para-lamas e Chapas de Fixacao", [
    node("Chapa de Fixacao"),
    ...leaves(
      "Para-lama DAF", "Para-lama Facchini", "Para-lama Ford", "Para-lama Guerra",
      "Para-lama Iveco", "Para-lama Librelato", "Para-lama MAN",
      "Para-lama Mercedes-Benz", "Para-lama NOMA", "Para-lama Pastre",
      "Para-lama Randon", "Para-lama Rossetti", "Para-lama Scania",
      "Para-lama Volkswagen", "Para-lama Volvo"
    ),
    node("Para-lamas Especificos", [
      ...leaves(
        "DAF", "Facchini", "Ford", "Guerra", "Iveco", "Librelato", "MAN",
        "Mercedes-Benz", "NOMA", "Pastre", "Randon", "Rossetti", "Scania",
        "Volkswagen", "Volvo"
      ),
    ]),
    ...leaves("Para-lamas Universais", "Suporte Para-lama", "Tampa Suporte Para-lama"),
  ]),
  node("Pe de Carreta"),
  node("Produtos Principais"),
  node("Quimicos e Lubrificantes", [
    ...leaves(
      "Aditivos", "Desengripante", "Engraxadeira", "Fluido de Freio",
      "Fluido para Radiadores", "Graxas", "Lubrificantes Diversos",
      "Massa de Polimento", "Oleo Hidraulico", "Selante para Radiador", "Tintas Spray"
    ),
  ]),
  node("Roda e Componentes de Roda", [
    ...leaves(
      "Aro Raiado", "Calco De Roda", "Calotas", "Capa Porca de Roda", "Cubo de Roda",
      "Extensoes de Bico e Itens Relacionados", "Pinos e Fixadores de Roda", "Pneus",
      "Roda de Aluminio", "Roda de Ferro", "Separador Aro"
    ),
  ]),
  node("Sistema de Freio e Componentes de Frenagem", [
    ...leaves(
      "Acionador de Freio", "Arrebites", "Bucha do Patim", "Bucha Pino Flange",
      "Buchas do Eixo S", "Catraca de Freio", "Cinta da Cuica", "Conexoes",
      "Conjunto de Freio", "Conjunto Reparo de Freio", "Cuica", "Diafragma",
      "Disco de Emergencia", "Disco de Freio", "Eixo Expansor", "Extensao Flexivel",
      "Forquilha", "Guarda Po", "Haste Longa", "Kit de Reparo Eixo S",
      "Kit Parafusos de Freio", "Lona de Freio", "Mangueira Ligacao", "Mao de Amigo",
      "Mola de Freio", "Pastilhas de Freio", "Patim de Freio", "Pino Forquilha",
      "Pino Patim", "Roldana do Patim", "Rolete", "Sistema ABS", "Suporte de Cuica",
      "Suporte Sapata", "Tambor de Freio", "Tampa Cuica", "Tapa Po", "Trava do Rolete",
      "Uniao Metalica", "Uniao Plastica", "Valvula Descarga Rapida", "Valvula Dreno",
      "Valvulas"
    ),
  ]),
  node("Sistemas de Exaustao e Arrefecimento", [
    ...leaves(
      "Catalisador", "Escapamento", "Filtros de Arrefecimento",
      "Reservatorios de Radiador", "Respiro do Tanque", "Silencioso"
    ),
  ]),
];

/** Count total nodes in tree */
export function countNodes(tree: CategoryNode[]): { parents: number; total: number } {
  let total = 0;
  const parents = tree.length;
  function walk(nodes: CategoryNode[]) {
    for (const n of nodes) {
      total++;
      if (n.children) walk(n.children);
    }
  }
  walk(tree);
  return { parents, total };
}
